import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient, LeadStatus, CampaignStatus } from '@prisma/client';
import { FlowEngineService } from '../services/flow-engine.service';
import { MessageQueueService } from '../services/message-queue.service';
import { AIService } from '../services/ai.service';
import { HttpService } from '../services/http.service';
import { webhookEventTracker } from '../services/webhook-event-tracker.service';

/**
 * Webhook Controller
 * 
 * Recebe webhooks da Evolution API e processa mensagens recebidas
 */
export class WebhookController {
  private flowEngine: FlowEngineService;
  private prisma: PrismaClient;

  constructor(
    prisma: PrismaClient,
    messageQueue: MessageQueueService,
    aiService: AIService,
    httpService: HttpService
  ) {
    this.prisma = prisma;
    this.flowEngine = new FlowEngineService(prisma, messageQueue, aiService, httpService);
  }

  /**
   * Endpoint para receber webhooks da Evolution API
   * 
   * Formato esperado da Evolution API:
   * {
   *   "event": "messages.upsert",
   *   "instance": "instance_name",
   *   "data": {
   *     "key": {...},
   *     "message": {
   *       "conversation": "mensagem de texto",
   *       "extendedTextMessage": {...},
   *       ...
   *     },
   *     "messageType": "conversation",
   *     "pushName": "Nome do contato",
   *     ...
   *   }
   * }
   */
  async handleEvolutionWebhook(
    request: FastifyRequest<{
      Body: {
        event: string;
        instance: string;
        data: {
          key: {
            remoteJid: string;
            fromMe?: boolean;
          };
          message: {
            conversation?: string;
            extendedTextMessage?: {
              text: string;
            };
            imageMessage?: any;
            videoMessage?: any;
            documentMessage?: any;
          };
          messageType: string;
          pushName?: string;
        };
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { event, instance, data } = request.body;

      // Buscar organização pela instância ANTES de registrar evento
      const evolutionInstance = await this.prisma.evolutionInstance.findFirst({
        where: {
          instanceName: instance,
        },
      });

      // Registrar TODOS os eventos no tracker (para testes e nó de webhook)
      // Isso permite que o teste detecte qualquer evento, não apenas mensagens
      const webhookEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        instance,
        event,
        data,
        receivedAt: new Date(),
        organizationId: evolutionInstance?.organizationId,
      };
      
      // Registrar evento no tracker (sempre, independente do tipo)
      webhookEventTracker.registerEvent(webhookEvent);

      // Usar a organização já buscada anteriormente
      if (!evolutionInstance || !evolutionInstance.organization) {
        reply.code(400).send({ error: 'Organização não encontrada para esta instância' });
        return;
      }

      const organizationId = evolutionInstance.organizationId;

      // Extrair número do telefone (formato: 5511999999999@s.whatsapp.net)
      const remoteJid = data.key.remoteJid;
      const phone = remoteJid.split('@')[0];

      // Atualizar status de leads da campanha para mensagens ENVIADAS (fromMe = true)
      // Ex.: DELIVERY_ACK, READ, FAILED, etc, conforme Evolution API
      if (data.key.fromMe) {
        const status = (data as any).status as string | undefined;
        await this.updateCampaignLeadStatusFromOutgoingEvent(phone, organizationId, status);

        // Para eventos de mensagem enviada, não precisamos processar Flow Engine
        reply.code(200).send({ success: true, message: 'Evento de envio processado' });
        return;
      }

      // Processar apenas mensagens recebidas do contato (não enviadas por nós)
      if (event !== 'messages.upsert') {
        reply.code(200).send({ success: true, message: 'Evento ignorado' });
        return;
      }

      // Extrair texto da mensagem recebida
      let messageText = '';
      if (data.message.conversation) {
        messageText = data.message.conversation;
      } else if (data.message.extendedTextMessage?.text) {
        messageText = data.message.extendedTextMessage.text;
      } else {
        // Mensagem de mídia ou outro tipo não suportado
        reply.code(200).send({ success: true, message: 'Tipo de mensagem não suportado' });
        return;
      }

      // PRIMEIRO: Verificar campanhas ativas para este contato
      // Isso garante que o flow correto da campanha seja iniciado antes de qualquer flow genérico
      const contact = await this.prisma.contact.findFirst({
        where: {
          phone,
          organizationId,
        },
      });

      let campaignFlowStarted = false;

      if (contact) {
        // Buscar campanhas ativas onde este contato recebeu mensagem
        const activeCampaigns = await this.prisma.campaign.findMany({
          where: {
            organizationId,
            status: 'RUNNING',
            leads: {
              some: {
                contactId: contact.id,
                status: { in: ['SENT', 'DELIVERED', 'READ', 'REPLIED'] }, // Qualquer status que indique que mensagem foi enviada
              },
            },
          },
          include: {
            flow: true,
          },
        });

        console.log(`[Webhook] 🎯 Campanhas ativas encontradas para contato ${phone}: ${activeCampaigns.length}`);

        // Para cada campanha ativa, verificar se a resposta corresponde ao trigger do flow
        for (const campaign of activeCampaigns) {
          if (!campaign.flow) {
            console.log(`[Webhook] ⚠️ Campanha ${campaign.name} não possui flow anexado`);
            continue;
          }

          console.log(`[Webhook] 🔍 Verificando campanha: ${campaign.name} (Flow: ${campaign.flow.name} - ${campaign.flow.id})`);

          const flowStructure = campaign.flow.nodes as any[];
          const startNode = flowStructure.find((node: any) => node.type === 'START');
          
          if (!startNode) {
            console.log(`[Webhook] ⚠️ Flow ${campaign.flow.id} não possui nó START`);
            continue;
          }

          // Verificar se o trigger corresponde (usando método do FlowEngine)
          const triggerMatches = this.checkTriggerMatch(startNode, messageText);
          
          console.log(`[Webhook] ${triggerMatches ? '✅' : '❌'} Trigger ${triggerMatches ? 'CORRESPONDE' : 'NÃO CORRESPONDE'} para campanha ${campaign.name}`);
          
          if (triggerMatches) {
            console.log(`[Webhook] ✅ Iniciando flow da campanha: ${campaign.flow.name} (${campaign.flow.id})`);
            
            // Marcar lead como REPLIED para esta campanha
            await this.markCampaignLeadAsReplied(contact.id, campaign.id);

            // Iniciar flow através do método startFlowFromCampaign
            // Este método agora cancela execuções ativas de outros flows automaticamente
            await this.flowEngine.startFlowFromCampaign(
              contact.id,
              campaign.flow.id,
              organizationId,
              campaign.id // Passar campaignId para usar instância da campanha
            );
            
            campaignFlowStarted = true;
            // Apenas iniciar o primeiro flow que corresponder
            break;
          } else {
            // CRÍTICO: Mesmo que o trigger não corresponda, se há campanha ativa,
            // devemos cancelar execuções ativas de flows genéricos
            // Isso garante que o flow da campanha tenha prioridade
            console.log(`[Webhook] ⚠️ Trigger não correspondeu, mas há campanha ativa. Verificando execuções genéricas...`);
            
            const activeExecutions = await this.prisma.flowExecution.findMany({
              where: {
                contactId: contact.id,
                status: { in: ['PROCESSING', 'WAITING'] },
                flowId: { not: campaign.flow.id }, // Excluir flow da campanha
              },
              include: {
                flow: true,
              },
            });

            if (activeExecutions.length > 0) {
              console.log(`[Webhook] ⚠️ Encontradas ${activeExecutions.length} execução(ões) genérica(s). Cancelando para priorizar campanha.`);
              
              for (const execution of activeExecutions) {
                console.log(`[Webhook]   - Cancelando execução ${execution.id} do flow ${execution.flow.name}`);
                await this.prisma.flowExecution.update({
                  where: { id: execution.id },
                  data: {
                    status: 'ABANDONED',
                    completedAt: new Date(),
                  },
                });
              }
            }
          }
        }
      }

      // SEGUNDO: Processar mensagem através do Flow Engine apenas se nenhuma campanha iniciou um flow
      // CRÍTICO: Se há campanha ativa, NUNCA processar flows genéricos
      // O flow da campanha é a ÚNICA opção permitida
      if (!campaignFlowStarted) {
        // Verificar se há campanhas ativas para este contato
        if (contact) {
          const hasActiveCampaigns = await this.prisma.campaign.findFirst({
            where: {
              organizationId,
              status: 'RUNNING',
              leads: {
                some: {
                  contactId: contact.id,
                  status: { in: ['SENT', 'DELIVERED', 'READ', 'REPLIED'] },
                },
              },
            },
            include: {
              flow: true,
            },
          });

          if (hasActiveCampaigns) {
            console.log(`[Webhook] 🚫 BLOQUEADO: Campanha ativa encontrada para contato ${phone}.`);
            console.log(`[Webhook] 🚫 Flows genéricos NÃO serão executados. Apenas o flow da campanha é permitido.`);
            console.log(`[Webhook] 🎯 Campanha: ${hasActiveCampaigns.name} (Flow: ${hasActiveCampaigns.flow?.name || 'NENHUM'})`);
            reply.code(200).send({ 
              success: true, 
              message: 'Campanha ativa encontrada. Apenas o flow da campanha pode ser executado.',
              blocked: true,
              reason: 'active_campaign'
            });
            return; // NÃO processar flows genéricos
          }
        }

        // Se não há campanhas ativas, processar mensagem normalmente (flows genéricos)
        console.log(`[Webhook] ✅ Nenhuma campanha ativa. Processando flows genéricos...`);
        await this.flowEngine.processIncomingMessage({
          phone,
          message: messageText,
          organizationId,
          messageId: data.key.remoteJid,
          timestamp: new Date(),
        });
      }

      reply.code(200).send({ success: true });
    } catch (error: any) {
      console.error('Erro ao processar webhook:', error);
      reply.code(500).send({ error: 'Erro interno do servidor' });
    }
  }

  /**
   * Verifica se o trigger do nó START corresponde à mensagem recebida
   */
  private checkTriggerMatch(startNode: any, message: string): boolean {
    const { triggerType, keyword } = startNode.config || {};
    const messageLower = message.trim().toLowerCase();
    const keywordLower = keyword?.toLowerCase() || '';

    switch (triggerType) {
      case 'KEYWORD_EXACT':
        return messageLower === keywordLower;
      
      case 'KEYWORD_CONTAINS':
        return messageLower.includes(keywordLower);
      
      case 'KEYWORD_STARTS_WITH':
        return messageLower.startsWith(keywordLower);
      
      case 'ANY_RESPONSE':
        return message.trim().length > 0;
      
      default:
        return false;
    }
  }

  /**
   * Atualiza o status de leads de campanha baseado em eventos de mensagens enviadas (fromMe = true)
   * Ex.: DELIVERY_ACK, READ, FAILED, etc.
   */
  private async updateCampaignLeadStatusFromOutgoingEvent(
    phone: string,
    organizationId: string,
    evolutionStatus?: string
  ): Promise<void> {
    if (!evolutionStatus) return;

    const statusUpper = evolutionStatus.toUpperCase();

    let newStatus: LeadStatus | null = null;

    if (statusUpper.includes('DELIVERY')) {
      newStatus = LeadStatus.DELIVERED;
    } else if (statusUpper.includes('READ')) {
      newStatus = LeadStatus.READ;
    } else if (statusUpper.includes('FAILED') || statusUpper.includes('ERROR')) {
      newStatus = LeadStatus.ERROR;
    }

    if (!newStatus) {
      return;
    }

    // Encontrar contato
    const contact = await this.prisma.contact.findFirst({
      where: {
        phone,
        organizationId,
      },
    });

    if (!contact) {
      return;
    }

    // Buscar campanhas em execução onde este contato é lead
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        organizationId,
        status: CampaignStatus.RUNNING,
        leads: {
          some: {
            contactId: contact.id,
          },
        },
      },
      select: {
        id: true,
      },
    });

    for (const campaign of campaigns) {
      // Pegar o lead mais recente desta campanha
      const lead = await this.prisma.campaignLead.findFirst({
        where: {
          campaignId: campaign.id,
          contactId: contact.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!lead) continue;

      // Atualizar status do lead
      await this.prisma.campaignLead.update({
        where: { id: lead.id },
        data: {
          status: newStatus,
        },
      });

      // Atualizar estatísticas da campanha
      const statsUpdate: any = {};

      if (newStatus === LeadStatus.DELIVERED) {
        statsUpdate.delivered = { increment: 1 };
      } else if (newStatus === LeadStatus.READ) {
        statsUpdate.read = { increment: 1 };
      } else if (newStatus === LeadStatus.ERROR) {
        statsUpdate.error = { increment: 1 };
      }

      if (Object.keys(statsUpdate).length > 0) {
        await this.prisma.campaignStats.updateMany({
          where: { campaignId: campaign.id },
          data: statsUpdate,
        });
      }
    }
  }

  /**
   * Marca lead de campanha como REPLIED quando o contato responde
   */
  private async markCampaignLeadAsReplied(contactId: string, campaignId: string): Promise<void> {
    const lead = await this.prisma.campaignLead.findFirst({
      where: {
        campaignId,
        contactId,
      },
    });

    if (!lead) return;

    if (lead.status !== LeadStatus.REPLIED) {
      await this.prisma.campaignLead.update({
        where: { id: lead.id },
        data: {
          status: LeadStatus.REPLIED,
        },
      });

      await this.prisma.campaignStats.updateMany({
        where: { campaignId },
        data: {
          replied: {
            increment: 1,
          },
        },
      });
    }
  }

  /**
   * Endpoint de health check
   */
  async healthCheck(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }
}


