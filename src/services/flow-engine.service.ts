import { PrismaClient, FlowStatus } from '@prisma/client';
import {
  FlowNode,
  FlowContextData,
  StartNode,
  MessageNode,
  MediaNode,
  ActionNode,
  TimerNode,
  HttpNode,
  AINode,
  ConditionNode,
  EndNode,
} from '../types/flow-nodes';
import { MessageQueueService } from './message-queue.service';
import { AIService } from './ai.service';
import { HttpService } from './http.service';
import { AIClassificationService } from './ai-classification.service';

/**
 * Flow Engine Service
 * 
 * Responsável por processar os flows como uma máquina de estados.
 * 
 * Fluxo de execução:
 * 1. Recebe webhook da Evolution API (mensagem recebida)
 * 2. Verifica se o contato já tem uma FlowExecution com status "WAITING"
 * 3. Se sim, processa a resposta e avança para o próximo nó
 * 4. Se não, verifica se há um flow ativo com trigger keyword
 * 5. Processa cada nó sequencialmente até encontrar um ActionNode ou EndNode
 */
export class FlowEngineService {
  private classificationService: AIClassificationService;
  private processingNodes: Set<string> = new Set(); // Rastrear nós sendo processados para evitar duplicação

  constructor(
    private prisma: PrismaClient,
    private messageQueue: MessageQueueService,
    private aiService: AIService,
    private httpService: HttpService
  ) {
    this.classificationService = new AIClassificationService();
  }

  /**
   * Processa uma mensagem recebida da Evolution API
   */
  async processIncomingMessage(data: {
    phone: string;
    message: string;
    organizationId: string;
    messageId?: string;
    timestamp?: Date;
  }): Promise<void> {
    const { phone, message, organizationId } = data;

    console.log(`[Flow Engine] 📥 Processando mensagem recebida:`);
    console.log(`[Flow Engine]   - Telefone: ${phone}`);
    console.log(`[Flow Engine]   - Mensagem: "${message}"`);
    console.log(`[Flow Engine]   - Organização: ${organizationId}`);

    // 1. Buscar ou criar contato
    let contact = await this.prisma.contact.findFirst({
      where: {
        phone,
        organizationId,
      },
    });

    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          phone,
          organizationId,
          name: phone, // Nome padrão
        },
      });
    }

    // 2. CRÍTICO: Verificar se há campanhas ativas ANTES de verificar execuções ativas
    // Se houver campanha ativa, o flow da campanha tem prioridade absoluta
    const activeCampaigns = await this.prisma.campaign.findMany({
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

    // Se há campanhas ativas, verificar se a execução ativa pertence ao flow da campanha
    let shouldContinueActiveExecution = false;
    let activeExecution = null;

    if (activeCampaigns.length > 0) {
      console.log(`[Flow Engine] 🎯 Campanhas ativas encontradas: ${activeCampaigns.length}`);
      
      // Buscar execução ativa
      activeExecution = await this.prisma.flowExecution.findFirst({
        where: {
          contactId: contact.id,
          status: {
            in: [FlowStatus.WAITING, FlowStatus.PROCESSING],
          },
        },
        include: {
          flow: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      if (activeExecution) {
        // Verificar se a execução ativa pertence a algum flow de campanha ativa
        const belongsToCampaign = activeCampaigns.some(
          campaign => campaign.flowId === activeExecution!.flowId
        );

        if (belongsToCampaign) {
          console.log(`[Flow Engine] ✅ Execução ativa pertence ao flow da campanha. Continuando execução.`);
          shouldContinueActiveExecution = true;
        } else {
          console.log(`[Flow Engine] ⚠️ Execução ativa NÃO pertence ao flow da campanha. Cancelando execução genérica.`);
          // Cancelar execução ativa de flow genérico
          await this.prisma.flowExecution.update({
            where: { id: activeExecution.id },
            data: {
              status: FlowStatus.ABANDONED,
              completedAt: new Date(),
            },
          });
          activeExecution = null; // Não continuar esta execução
        }
      }
    } else {
      // Se não há campanhas ativas, verificar execuções ativas normalmente
      activeExecution = await this.prisma.flowExecution.findFirst({
        where: {
          contactId: contact.id,
          status: {
            in: [FlowStatus.WAITING, FlowStatus.PROCESSING],
          },
        },
        include: {
          flow: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      if (activeExecution) {
        shouldContinueActiveExecution = true;
      }
    }

    if (activeExecution && shouldContinueActiveExecution) {
      console.log(`[Flow Engine] 🔄🔄🔄 EXECUÇÃO ATIVA ENCONTRADA!`);
      console.log(`[Flow Engine] 🔄 Execução ID: ${activeExecution.id}`);
      console.log(`[Flow Engine] 🔄 Status: ${activeExecution.status}`);
      console.log(`[Flow Engine] 🔄 Flow: ${activeExecution.flow.name} (${activeExecution.flow.id})`);
      console.log(`[Flow Engine] 🔄 Nó atual: ${activeExecution.currentNodeId}`);
      console.log(`[Flow Engine] 🔄 Continuando execução existente ao invés de criar nova`);
      
      // Verificar o tipo do nó atual para logs mais detalhados
      const flowStructure = activeExecution.flow.nodes as unknown as FlowNode[];
      const currentNode = flowStructure.find(
        (node) => node.id === activeExecution.currentNodeId
      );
      
      if (currentNode) {
        console.log(`[Flow Engine] 🔄 Tipo do nó atual: ${currentNode.type}`);
        if (currentNode.type === 'START') {
          console.log(`[Flow Engine] 🔄🔄🔄 NÓ START DETECTADO! Isso indica execução resetada.`);
        }
      } else {
        console.warn(`[Flow Engine] ⚠️ Nó atual ${activeExecution.currentNodeId} não encontrado na estrutura do flow!`);
      }
      
      // Se a execução está PROCESSING, aguardar resposta do usuário (mudar para WAITING)
      if (activeExecution.status === FlowStatus.PROCESSING) {
        console.log(`[Flow Engine] 🔄 Status é PROCESSING, continuando execução...`);
        // Verificar se o nó atual é um ACTION (aguardando resposta)
        if (currentNode?.type === 'ACTION') {
          // Continuar execução normalmente
          await this.continueFlowExecution(activeExecution.id, message);
        } else {
          // Se não é ACTION, pode ser que o flow esteja processando outro nó
          // Neste caso, aguardar ou processar a mensagem como resposta
          await this.continueFlowExecution(activeExecution.id, message);
        }
      } else {
        // Status WAITING - continuar execução normalmente
        console.log(`[Flow Engine] 🔄 Status é WAITING, continuando execução...`);
        console.log(`[Flow Engine] 🔄 Chamando continueFlowExecution para execução ${activeExecution.id}`);
        await this.continueFlowExecution(activeExecution.id, message);
        console.log(`[Flow Engine] 🔄 continueFlowExecution concluído`);
      }
      return; // Não processar mais nada
    } else {
      // CRÍTICO: Se há campanhas ativas, NUNCA iniciar flows genéricos
      // O flow da campanha é a ÚNICA opção para contatos de campanhas
      if (activeCampaigns.length > 0) {
        console.log(`[Flow Engine] 🚫 BLOQUEADO: Há ${activeCampaigns.length} campanha(s) ativa(s) para este contato.`);
        console.log(`[Flow Engine] 🚫 Flows genéricos NÃO serão executados. Apenas o flow da campanha pode ser usado.`);
        
        // Verificar se alguma campanha tem flow e tentar iniciar
        for (const campaign of activeCampaigns) {
          if (campaign.flow) {
            console.log(`[Flow Engine] 🎯 Tentando iniciar flow da campanha: ${campaign.flow.name} (${campaign.flow.id})`);
            
            // ✅ CRÍTICO: Verificar PRIMEIRO se já existe execução COMPLETED para este flow e contato
            // Esta verificação deve ser feita ANTES de verificar trigger ou iniciar flow
            const existingCompleted = await this.prisma.flowExecution.findFirst({
              where: {
                contactId: contact.id,
                flowId: campaign.flow.id,
                status: FlowStatus.COMPLETED,
              },
              orderBy: {
                completedAt: 'desc',
              },
            });

            if (existingCompleted) {
              console.log(`[Flow Engine] 🚫🚫🚫 BLOQUEIO: Flow ${campaign.flow.name} já foi COMPLETADO para este contato!`);
              console.log(`[Flow Engine] 🚫 Execução COMPLETED: ${existingCompleted.id}`);
              console.log(`[Flow Engine] 🚫 Completada em: ${existingCompleted.completedAt}`);
              console.log(`[Flow Engine] 🚫 Use "Resetar Flows" na campanha para permitir re-execução.`);
              continue; // Pular esta campanha e verificar próxima (se houver)
            }
            
            // Verificar trigger do flow da campanha
            const flowStructure = campaign.flow.nodes as any[];
            const startNode = flowStructure.find((node: any) => node.type === 'START');
            
            if (startNode) {
              const triggerMatches = this.checkTriggerMatch(startNode as StartNode, message);
              
              if (triggerMatches) {
                console.log(`[Flow Engine] ✅ Trigger corresponde! Iniciando flow da campanha.`);
                await this.startFlowFromCampaign(
                  contact.id,
                  campaign.flow.id,
                  organizationId,
                  campaign.id
                );
                return; // Flow da campanha iniciado, não processar mais nada
              } else {
                console.log(`[Flow Engine] ⚠️ Trigger não correspondeu para campanha ${campaign.name}.`);
              }
            }
          }
        }
        
        // Se chegou aqui, há campanha ativa mas trigger não correspondeu
        // NÃO iniciar flow genérico - apenas o flow da campanha pode ser usado
        console.log(`[Flow Engine] 🚫 Nenhum flow genérico será iniciado. Apenas flows de campanhas são permitidos para este contato.`);
        return; // NÃO processar flows genéricos
      }
      
      // Se não há campanhas ativas, processar normalmente
      console.log(`[Flow Engine] 🆕 Nenhuma execução ativa encontrada. Verificando execuções completadas e cooldown...`);
      
      // Verificar se há execução COMPLETED recente e se pode iniciar novo flow
      const canStart = await this.canStartNewFlow(contact.id, organizationId);
      
      if (!canStart.canStart) {
        console.log(`[Flow Engine] ⏸️ Novo disparo bloqueado: ${canStart.reason}`);
        return; // Não iniciar novo flow
      }
      
      // Verificar se há um flow com trigger keyword (apenas se NÃO há campanha ativa)
      await this.startNewFlow(contact.id, message, organizationId);
    }
  }

  /**
   * Continua uma execução de flow existente
   */
  private async continueFlowExecution(
    executionId: string,
    userMessage: string
  ): Promise<void> {
    console.log(`[Flow Engine] 🔄 continueFlowExecution chamado para execução ${executionId}`);
    
    const execution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId },
      include: {
        flow: true,
        contact: true,
      },
    });

    if (!execution) {
      console.error(`[Flow Engine] ❌ Execução ${executionId} não encontrada`);
      return;
    }

    console.log(`[Flow Engine] 🔍 Status da execução: ${execution.status}`);
    console.log(`[Flow Engine] 🔍 Nó atual: ${execution.currentNodeId}`);

    if (execution.status !== FlowStatus.WAITING) {
      console.log(`[Flow Engine] ⚠️ Execução não está em WAITING (status: ${execution.status}). Retornando.`);
      return;
    }

    // Atualizar status para PROCESSING
    await this.prisma.flowExecution.update({
      where: { id: executionId },
      data: { status: FlowStatus.PROCESSING },
    });
    
    console.log(`[Flow Engine] ✅ Status atualizado para PROCESSING`);

    try {
      const flowStructure = execution.flow.nodes as unknown as FlowNode[];
      const edges = execution.flow.edges as any[];
      const contextData = (execution.contextData || {}) as unknown as FlowContextData;

      // Verificar se currentNodeId existe
      if (!execution.currentNodeId) {
        console.error(`[Flow Engine] ❌ Execução ${executionId} não possui currentNodeId`);
        throw new Error(`Execução ${executionId} não possui currentNodeId`);
      }

      // Encontrar o nó atual
      const currentNode = flowStructure.find(
        (node) => node.id === execution.currentNodeId
      );

      if (!currentNode) {
        throw new Error(`Nó atual não encontrado: ${execution.currentNodeId}`);
      }

      // ✅ CRÍTICO: Se o nó atual é START (após reset), processar o START e avançar automaticamente
      if (currentNode.type === 'START') {
        console.log(`[Flow Engine] 🔄🔄🔄 Execução resetada detectada no nó START!`);
        console.log(`[Flow Engine] 🔄 Nó START ID: ${currentNode.id}`);
        console.log(`[Flow Engine] 🔄 Processando START e avançando automaticamente...`);
        // Processar o nó START (que avança automaticamente para o próximo nó)
        try {
          if (!execution.currentNodeId) {
            throw new Error(`currentNodeId é null para execução ${executionId}`);
          }
          await this.processNode(
            executionId,
            execution.currentNodeId,
            flowStructure,
            edges,
            contextData
          );
          console.log(`[Flow Engine] ✅✅✅ Nó START processado com sucesso e avançou para próximo nó`);
        } catch (error: any) {
          console.error(`[Flow Engine] ❌❌❌ Erro ao processar nó START:`, error.message);
          console.error(`[Flow Engine] ❌ Stack:`, error.stack);
          throw error;
        }
        return; // START já processa e avança automaticamente
      }

      // Se o nó atual é um ActionNode, processar a resposta
      if (currentNode.type === 'ACTION') {
        const actionNode = currentNode as ActionNode;
        
        // Salvar resposta do usuário no contexto
        if (actionNode.config.saveResponseAs) {
          if (!contextData.variables) {
            contextData.variables = {};
          }
          contextData.variables[actionNode.config.saveResponseAs] = userMessage;
        }

        // Adicionar ao histórico de respostas
        if (!contextData.userResponses) {
          contextData.userResponses = [];
        }
        contextData.userResponses.push({
          nodeId: currentNode.id,
          timestamp: new Date(),
          response: userMessage,
        });

        // Encontrar próximo nó através das edges
        const nextEdge = edges.find((edge) => edge.source === currentNode.id);
        if (nextEdge) {
          await this.processNode(
            executionId,
            nextEdge.target,
            flowStructure,
            edges,
            contextData
          );
        } else {
          // Sem próximo nó, finalizar execução
          await this.completeExecution(executionId);
        }
      }
    } catch (error) {
      console.error(`Erro ao continuar execução ${executionId}:`, error);
      await this.abandonExecution(executionId);
    }
  }

  /**
   * Inicia um novo flow baseado em trigger keyword
   * CRÍTICO: Este método NUNCA deve ser chamado se há campanhas ativas para o contato
   */
  private async startNewFlow(
    contactId: string,
    message: string,
    organizationId: string
  ): Promise<void> {
    console.log(`[Flow Engine] 🔍 Buscando flows genéricos para organização ${organizationId}`);
    console.log(`[Flow Engine] 📨 Mensagem recebida: "${message}" do contato ${contactId}`);

    // Buscar contato para verificar campanhas ativas
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      console.log(`[Flow Engine] ⚠️ Contato ${contactId} não encontrado`);
      return;
    }

    // CRÍTICO: Verificar campanhas ativas ANTES de buscar flows genéricos
    // Se há campanha ativa, NÃO buscar flows genéricos
    const activeCampaigns = await this.prisma.campaign.findMany({
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
      select: {
        flowId: true,
        name: true,
      },
    });

    if (activeCampaigns.length > 0) {
      console.log(`[Flow Engine] 🚫 BLOQUEADO: Há ${activeCampaigns.length} campanha(s) ativa(s) para este contato.`);
      console.log(`[Flow Engine] 🚫 Flows genéricos NÃO serão executados. Apenas flows de campanhas são permitidos.`);
      activeCampaigns.forEach(c => {
        console.log(`[Flow Engine]   - Campanha: ${c.name} (Flow: ${c.flowId || 'NENHUM'})`);
      });
      return; // NÃO executar flows genéricos se há campanha ativa
    }

    // Extrair IDs dos flows associados a campanhas ativas (para exclusão)
    const campaignFlowIds = activeCampaigns
      .map((c) => c.flowId)
      .filter((id): id is string => id !== null);

    console.log(`[Flow Engine] ✅ Nenhuma campanha ativa. Buscando flows genéricos...`);

    // Buscar flows ativos da organização, EXCLUINDO os que estão em campanhas ativas
    const flows = await this.prisma.flow.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(campaignFlowIds.length > 0 && {
          id: {
            notIn: campaignFlowIds,
          },
        }),
      },
    });

    console.log(`[Flow Engine] 📊 Flows genéricos disponíveis: ${flows.length}`);

    // Verificar cada flow para encontrar um que corresponda ao trigger
    for (const flow of flows) {
      console.log(`[Flow Engine] 🔎 Verificando flow: ${flow.id} - ${flow.name}`);

      const flowStructure = flow.nodes as unknown as FlowNode[];
      const edges = flow.edges as any[];

      if (!flowStructure || flowStructure.length === 0) {
        console.log(`[Flow Engine] ⚠️ Flow ${flow.id} não possui nós`);
        continue;
      }

      // Encontrar o nó START
      const startNode = flowStructure.find(
        (node) => node.type === 'START'
      ) as StartNode;

      if (!startNode) {
        console.log(`[Flow Engine] ⚠️ Flow ${flow.id} não possui nó START`);
        continue; // Flow sem nó START, pular
      }

      console.log(`[Flow Engine] 🎯 Nó START encontrado: ${startNode.id}`);
      console.log(`[Flow Engine] 🎯 Config do START:`, JSON.stringify(startNode.config, null, 2));

      // Verificar se o trigger corresponde à mensagem
      const triggerMatches = this.checkTriggerMatch(startNode, message);
      
      console.log(`[Flow Engine] ${triggerMatches ? '✅' : '❌'} Trigger ${triggerMatches ? 'CORRESPONDE' : 'NÃO CORRESPONDE'} para flow ${flow.id}`);
      
      if (triggerMatches) {
        // ✅ CRÍTICO: Verificar PRIMEIRO se já existe execução COMPLETED para este flow e contato
        // REGRA ABSOLUTA: Se há execução COMPLETED, SEMPRE bloquear re-execução
        const existingCompleted = await this.prisma.flowExecution.findFirst({
          where: {
            contactId,
            flowId: flow.id,
            status: FlowStatus.COMPLETED,
          },
          orderBy: {
            completedAt: 'desc',
          },
        });

        if (existingCompleted) {
          console.log(`[Flow Engine] 🚫🚫🚫 BLOQUEIO ABSOLUTO: Flow ${flow.name} já foi COMPLETADO para este contato!`);
          console.log(`[Flow Engine] 🚫 Execução COMPLETED: ${existingCompleted.id}`);
          console.log(`[Flow Engine] 🚫 Completada em: ${existingCompleted.completedAt}`);
          console.log(`[Flow Engine] 🚫 Flow: ${flow.id}`);
          console.log(`[Flow Engine] 🚫 Contato: ${contactId}`);
          console.log(`[Flow Engine] 🚫 RETORNANDO SEM INICIAR NOVA EXECUÇÃO!`);
          continue; // Pular este flow e verificar próximo (se houver)
        }

        // IMPORTANTE: Verificar se já existe uma execução ativa para este contato e flow
        // Isso evita reiniciar o flow quando o mesmo número envia múltiplas mensagens
        const existingExecution = await this.prisma.flowExecution.findFirst({
          where: {
            contactId,
            flowId: flow.id,
            status: {
              in: [FlowStatus.PROCESSING, FlowStatus.WAITING],
            },
          },
        });

        if (existingExecution) {
          console.log(`[Flow Engine] ⚠️ Execução ativa já existe para contato ${contactId} e flow ${flow.id}. Ignorando nova mensagem para evitar reinício.`);
          console.log(`[Flow Engine] ⚠️ Execução existente: ${existingExecution.id} (Status: ${existingExecution.status})`);
          // Continuar a execução existente ao invés de criar nova
          await this.continueFlowExecution(existingExecution.id, message);
          return;
        }

        // Criar nova execução apenas se não existe execução ativa e cooldown expirado
        const execution = await this.prisma.flowExecution.create({
          data: {
            contactId,
            flowId: flow.id,
            currentNodeId: startNode.id,
            status: FlowStatus.PROCESSING,
            contextData: {
              variables: {},
              userResponses: [
                {
                  nodeId: startNode.id,
                  timestamp: new Date(),
                  response: message,
                },
              ],
              executedNodes: [],
            },
          },
        });

        console.log(`[Flow Engine] ✅ Trigger correspondido! Iniciando flow ${flow.id} para contato ${contactId} com mensagem: "${message}"`);

        // Processar a partir do nó START
        await this.processNode(
          execution.id,
          startNode.id,
          flowStructure,
          edges,
          execution.contextData as unknown as FlowContextData
        );
        
        // Apenas iniciar o primeiro flow que corresponder
        return;
      }
    }
  }

  /**
   * Inicia um flow para teste (isolado de campanhas)
   * Sempre cria uma nova execução, abandonando execuções existentes do mesmo flow
   */
  async startFlowForTest(
    contactId: string,
    flowId: string,
    organizationId: string
  ): Promise<void> {
    console.log(`[Flow Engine] 🧪 Iniciando flow para TESTE:`);
    console.log(`[Flow Engine]   - Contato: ${contactId}`);
    console.log(`[Flow Engine]   - Flow: ${flowId}`);

    // TESTE: Abandonar TODAS as execuções existentes deste flow para este contato
    // Isso garante que o teste sempre comece do zero
    const existingExecutions = await this.prisma.flowExecution.findMany({
      where: {
        contactId,
        flowId,
        status: {
          in: [FlowStatus.PROCESSING, FlowStatus.WAITING, FlowStatus.COMPLETED],
        },
      },
    });

    if (existingExecutions.length > 0) {
      console.log(`[Flow Engine] 🧪 Abandonando ${existingExecutions.length} execução(ões) existente(s) para isolar o teste`);
      
      for (const execution of existingExecutions) {
        await this.prisma.flowExecution.update({
          where: { id: execution.id },
          data: {
            status: FlowStatus.ABANDONED,
            completedAt: new Date(),
          },
        });
      }
    }

    // Buscar flow específico
    const flow = await this.prisma.flow.findFirst({
      where: {
        id: flowId,
        organizationId,
        isActive: true,
      },
    });

    if (!flow) {
      console.error(`[Flow Engine] Flow ${flowId} não encontrado ou inativo`);
      throw new Error(`Flow não encontrado ou inativo`);
    }

    const flowStructure = flow.nodes as unknown as FlowNode[];
    const edges = flow.edges as any[];

    // Encontrar o nó START
    const startNode = flowStructure.find(
      (node) => node.type === 'START'
    ) as StartNode;

    if (!startNode) {
      console.error(`[Flow Engine] Flow ${flowId} não possui nó START`);
      throw new Error(`Flow não possui nó START`);
    }

    // Criar nova execução para teste (sempre nova, sem verificar existentes)
    const execution = await this.prisma.flowExecution.create({
      data: {
        contactId,
        flowId: flow.id,
        currentNodeId: startNode.id,
        status: FlowStatus.PROCESSING,
        contextData: {
          variables: {
            contactPhone: '', // Será preenchido se necessário
            isTest: true, // Marcar como teste
          },
          userResponses: [],
          executedNodes: [],
        },
      },
    });

    console.log(`[Flow Engine] 🧪 Nova execução de teste criada: ${execution.id}`);
    console.log(`[Flow Engine]   - Nó START: ${startNode.id}`);
    console.log(`[Flow Engine]   - Total de nodes: ${flowStructure.length}`);
    console.log(`[Flow Engine]   - Total de edges: ${edges.length}`);

    // Processar a partir do nó START
    try {
      await this.processNode(
        execution.id,
        startNode.id,
        flowStructure,
        edges,
        execution.contextData as unknown as FlowContextData
      );
      console.log(`[Flow Engine] ✅ Processamento do nó START concluído no teste`);
    } catch (error: any) {
      console.error(`[Flow Engine] ❌ Erro ao processar nó START no teste:`, error.message);
      console.error(`[Flow Engine]   - Stack:`, error.stack);
      // Atualizar execução para ABANDONED em caso de erro
      await this.prisma.flowExecution.update({
        where: { id: execution.id },
        data: {
          status: FlowStatus.ABANDONED,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Inicia um flow a partir de uma campanha
   * Similar a startNewFlow, mas recebe flowId diretamente
   */
  async startFlowFromCampaign(
    contactId: string,
    flowId: string,
    organizationId: string,
    campaignId?: string
  ): Promise<void> {
    console.log(`[Flow Engine] 🎯 Iniciando flow de campanha:`);
    console.log(`[Flow Engine]   - Contato: ${contactId}`);
    console.log(`[Flow Engine]   - Flow: ${flowId}`);
    console.log(`[Flow Engine]   - Campanha: ${campaignId || 'N/A'}`);

    // CRÍTICO: SEMPRE verificar PRIMEIRO se já existe execução COMPLETED
    // Esta verificação deve ser feita ANTES de qualquer outra operação
    // REGRA ABSOLUTA: Se há execução COMPLETED para este flow e contato, BLOQUEAR
    // IMPORTANTE: Esta verificação deve ser feita SEMPRE, independente de ter campaignId ou não
    console.log(`[Flow Engine] 🔍🔍🔍 VERIFICAÇÃO RIGOROSA: Procurando execuções COMPLETED...`);
    console.log(`[Flow Engine]   - Contato: ${contactId}`);
    console.log(`[Flow Engine]   - Flow: ${flowId}`);
    console.log(`[Flow Engine]   - Campanha: ${campaignId || 'N/A'}`);
    
    // Buscar TODAS as execuções COMPLETED para este flow e contato
    const allCompletedExecutions = await this.prisma.flowExecution.findMany({
      where: {
        contactId,
        flowId,
        status: FlowStatus.COMPLETED,
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    console.log(`[Flow Engine] 🔍 Total de execuções COMPLETED encontradas: ${allCompletedExecutions.length}`);

    // REGRA ABSOLUTA: Se encontrar QUALQUER execução COMPLETED para este flow e contato, BLOQUEAR
    // Não importa se tem campaignId ou não - se há execução COMPLETED, o flow já foi executado
    if (allCompletedExecutions.length > 0) {
      console.log(`[Flow Engine] ⚠️⚠️⚠️ ATENÇÃO: Encontrada(s) ${allCompletedExecutions.length} execução(ões) COMPLETED!`);
      console.log(`[Flow Engine] ⚠️ REGRA ABSOLUTA: Se há execução COMPLETED, o flow JÁ FOI EXECUTADO para este contato!`);
      
      // BLOQUEAR SEMPRE se há execução COMPLETED, independente de ter campaignId ou não
      const mostRecentCompleted = allCompletedExecutions[0];
      const contextData = mostRecentCompleted.contextData as any;
      const completedCampaignId = contextData?.campaignId;
      
      console.log(`[Flow Engine] 🔍 Analisando execução mais recente ${mostRecentCompleted.id}:`);
      console.log(`[Flow Engine]   - Status: ${mostRecentCompleted.status}`);
      console.log(`[Flow Engine]   - Completada em: ${mostRecentCompleted.completedAt}`);
      console.log(`[Flow Engine]   - ContextData completo:`, JSON.stringify(contextData, null, 2));
      console.log(`[Flow Engine]   - CampaignId na execução: ${completedCampaignId || 'NÃO ENCONTRADO'} (tipo: ${typeof completedCampaignId})`);
      console.log(`[Flow Engine]   - CampaignId atual: ${campaignId || 'N/A'} (tipo: ${typeof campaignId})`);
      
      // REGRA ABSOLUTA: Se há execução COMPLETED para este flow e contato, SEMPRE bloquear
      // Mesmo que não tenha campaignId, se há execução COMPLETED, o flow já foi executado
      console.log(`[Flow Engine] 🚫🚫🚫 BLOQUEIO ABSOLUTO: Flow já foi COMPLETADO para este contato!`);
      console.log(`[Flow Engine] 🚫 Execução COMPLETED: ${mostRecentCompleted.id}`);
      console.log(`[Flow Engine] 🚫 Completada em: ${mostRecentCompleted.completedAt}`);
      console.log(`[Flow Engine] 🚫 Flow: ${flowId}`);
      console.log(`[Flow Engine] 🚫 Contato: ${contactId}`);
      if (completedCampaignId) {
        console.log(`[Flow Engine] 🚫 Campanha: ${completedCampaignId}`);
      } else {
        console.log(`[Flow Engine] 🚫 Campanha: NÃO ENCONTRADA (mas flow foi completado)`);
      }
      console.log(`[Flow Engine] 🚫 Use "Resetar Flows" na campanha para permitir re-execução.`);
      console.log(`[Flow Engine] 🚫 RETORNANDO SEM INICIAR NOVA EXECUÇÃO!`);
      return; // BLOQUEIO ABSOLUTO - Se há execução COMPLETED, SEMPRE bloquear
    } else {
      console.log(`[Flow Engine] ✅ Nenhuma execução COMPLETED encontrada. Prosseguindo...`);
    }

    // CRÍTICO: Verificar e cancelar execuções ativas de OUTROS flows
    // O flow da campanha tem prioridade absoluta sobre qualquer outro flow
    const activeExecutions = await this.prisma.flowExecution.findMany({
      where: {
        contactId,
        status: {
          in: [FlowStatus.PROCESSING, FlowStatus.WAITING],
        },
        flowId: {
          not: flowId, // Excluir o flow da campanha
        },
      },
      include: {
        flow: true,
      },
    });

    if (activeExecutions.length > 0) {
      console.log(`[Flow Engine] ⚠️ Encontradas ${activeExecutions.length} execução(ões) ativa(s) de outros flows. Cancelando para priorizar flow da campanha.`);
      
      for (const execution of activeExecutions) {
        console.log(`[Flow Engine]   - Cancelando execução ${execution.id} do flow ${execution.flow.name} (${execution.flow.id})`);
        
        // Cancelar execução ativa de outro flow
        await this.prisma.flowExecution.update({
          where: { id: execution.id },
          data: {
            status: FlowStatus.ABANDONED,
            completedAt: new Date(),
          },
        });
      }
    }

    // Buscar flow específico
    const flow = await this.prisma.flow.findFirst({
      where: {
        id: flowId,
        organizationId,
        isActive: true,
      },
    });

    if (!flow) {
      console.error(`[Flow Engine] Flow ${flowId} não encontrado ou inativo`);
      return;
    }

    const flowStructure = flow.nodes as unknown as FlowNode[];
    const edges = flow.edges as any[];

    // Encontrar o nó START
    const startNode = flowStructure.find(
      (node) => node.type === 'START'
    ) as StartNode;

    if (!startNode) {
      console.error(`[Flow Engine] Flow ${flowId} não possui nó START`);
      return;
    }

    // Verificar se já existe uma execução ativa para este contato e flow
    // Usar transação para evitar condições de corrida (race conditions)
    let execution;
    try {
      execution = await this.prisma.$transaction(async (tx) => {
        // CRÍTICO: Verificação DUPLA dentro da transação (camada extra de segurança)
        // REGRA ABSOLUTA: Se há execução COMPLETED para este flow e contato, SEMPRE bloquear
        if (campaignId) {
          const completedExecutionsInTx = await tx.flowExecution.findMany({
            where: {
              contactId,
              flowId: flow.id,
              status: FlowStatus.COMPLETED,
            },
            orderBy: {
              completedAt: 'desc',
            },
          });

          console.log(`[Flow Engine] 🔍 Verificação DENTRO da transação: ${completedExecutionsInTx.length} execução(ões) COMPLETED encontrada(s)`);

          // REGRA ABSOLUTA: Se encontrar QUALQUER execução COMPLETED, BLOQUEAR
          // Não importa se tem campaignId ou não - se há execução COMPLETED, o flow já foi executado
          if (completedExecutionsInTx.length > 0) {
            const mostRecentCompleted = completedExecutionsInTx[0];
            const contextData = mostRecentCompleted.contextData as any;
            const completedCampaignId = contextData?.campaignId;
            
            console.log(`[Flow Engine] 🚫🚫🚫 BLOQUEIO DENTRO DA TRANSAÇÃO: Flow já foi COMPLETADO!`);
            console.log(`[Flow Engine] 🚫 Execução: ${mostRecentCompleted.id}`);
            console.log(`[Flow Engine] 🚫 Completada em: ${mostRecentCompleted.completedAt}`);
            console.log(`[Flow Engine] 🚫 CampaignId na execução: ${completedCampaignId || 'NÃO ENCONTRADO'}`);
            console.log(`[Flow Engine] 🚫 CampaignId atual: ${campaignId}`);
            throw new Error('FLOW_ALREADY_COMPLETED'); // Lançar erro para interromper transação
          }
        }

        // Verificar execução ativa (PROCESSING/WAITING)
        const existingExecution = await tx.flowExecution.findFirst({
          where: {
            contactId,
            flowId: flow.id,
            status: {
              in: [FlowStatus.PROCESSING, FlowStatus.WAITING],
            },
          },
        });

        if (existingExecution) {
          console.log(`[Flow Engine] ✅ Já existe execução ativa para contato ${contactId} e flow ${flowId}`);
          console.log(`[Flow Engine] ✅ Continuando execução existente: ${existingExecution.id}`);
          return existingExecution;
        }

        // Criar nova execução (com campaignId se fornecido)
        // CRÍTICO: Garantir que campaignId está SEMPRE no contextData quando fornecido
        const contextDataToSave: any = {
          variables: {},
          userResponses: [],
          executedNodes: [],
        };
        
        // SEMPRE adicionar campaignId se fornecido
        if (campaignId) {
          contextDataToSave.campaignId = campaignId;
          console.log(`[Flow Engine] 🔒🔒🔒 CampaignId será salvo no contextData: ${campaignId}`);
        }
        
        const newExecution = await tx.flowExecution.create({
          data: {
            contactId,
            flowId: flow.id,
            currentNodeId: startNode.id,
            status: FlowStatus.PROCESSING,
            contextData: contextDataToSave,
          },
        });

        console.log(`[Flow Engine] ✅ Nova execução criada: ${newExecution.id}`);
        
        // Verificar se campaignId foi realmente salvo
        const savedContextData = newExecution.contextData as any;
        const savedCampaignId = savedContextData?.campaignId;
        
        if (campaignId) {
          if (savedCampaignId === campaignId) {
            console.log(`[Flow Engine] ✅✅✅ CampaignId confirmado salvo no contextData: ${savedCampaignId}`);
          } else {
            console.error(`[Flow Engine] ❌❌❌ ERRO CRÍTICO: CampaignId NÃO foi salvo corretamente!`);
            console.error(`[Flow Engine] ❌ Esperado: ${campaignId}, Salvo: ${savedCampaignId}`);
            console.error(`[Flow Engine] ❌ ContextData salvo:`, JSON.stringify(savedContextData, null, 2));
          }
        } else {
          console.log(`[Flow Engine] ℹ️ Nenhum campaignId fornecido (execução genérica)`);
        }
        
        return newExecution;
      }, {
        timeout: 10000, // Timeout de 10 segundos
      });
    } catch (error: any) {
      // Se o erro for FLOW_ALREADY_COMPLETED, retornar sem iniciar nova execução
      if (error.message === 'FLOW_ALREADY_COMPLETED') {
        console.log(`[Flow Engine] 🚫 Transação interrompida: Flow já completado para esta campanha`);
        return; // NÃO iniciar nova execução
      }
      
      // Se a transação falhar (por exemplo, devido a constraint violation), verificar se execução foi criada
      console.error(`[Flow Engine] ⚠️ Erro na transação:`, error.message);
      
      // Verificar se uma execução foi criada mesmo assim
      const existingExecution = await this.prisma.flowExecution.findFirst({
        where: {
          contactId,
          flowId: flow.id,
          status: {
            in: [FlowStatus.PROCESSING, FlowStatus.WAITING],
          },
        },
      });

      if (existingExecution) {
        console.log(`[Flow Engine] ✅ Execução encontrada após erro na transação: ${existingExecution.id}`);
        execution = existingExecution;
      } else {
        throw error;
      }
    }

    // Se já existe execução ativa (não foi criada agora), não processar novamente
    // Verificar se esta execução foi criada recentemente (menos de 2 segundos)
    if (execution.startedAt) {
      const executionAge = Date.now() - new Date(execution.startedAt).getTime();
      const isNewExecution = executionAge < 2000; // Menos de 2 segundos = nova execução
      
      if (!isNewExecution) {
        // Execução tem mais de 2 segundos, provavelmente já existia e está sendo processada
        console.log(`[Flow Engine] ⚠️ Execução existente detectada (idade: ${executionAge}ms). Não iniciando nova.`);
        return;
      }
    } else {
      // Se não há startedAt, assumir que é nova execução
      console.log(`[Flow Engine] ⚠️ Execução sem startedAt, assumindo que é nova`);
    }

    console.log(`[Flow Engine] Iniciando flow ${flowId} para contato ${contactId} (execução ${execution.id})`);
    console.log(`[Flow Engine]   - Nó START: ${startNode.id}`);
    console.log(`[Flow Engine]   - Total de nodes: ${flowStructure.length}`);
    console.log(`[Flow Engine]   - Total de edges: ${edges.length}`);
    console.log(`[Flow Engine]   - Edges:`, JSON.stringify(edges.map(e => ({ id: e.id, source: e.source, target: e.target })), null, 2));

    // Processar a partir do nó START
    try {
      await this.processNode(
        execution.id,
        startNode.id,
        flowStructure,
        edges,
        execution.contextData as unknown as FlowContextData
      );
      console.log(`[Flow Engine] ✅ Processamento do nó START concluído`);
    } catch (error: any) {
      console.error(`[Flow Engine] ❌ Erro ao processar nó START:`, error.message);
      console.error(`[Flow Engine]   - Stack:`, error.stack);
      // Atualizar execução para ABANDONED em caso de erro
      await this.prisma.flowExecution.update({
        where: { id: execution.id },
        data: {
          status: FlowStatus.ABANDONED,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Reseta uma execução e prepara para reiniciar do nó START
   * Agora permite resetar execuções ativas (PROCESSING/WAITING) também
   * IMPORTANTE: NÃO dispara o flow automaticamente. O flow só será executado quando o contato interagir.
   */
  async resetExecution(executionId: string): Promise<void> {
    const execution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId },
      include: {
        flow: true,
        contact: true,
      },
    });

    if (!execution) {
      throw new Error('Execução não encontrada');
    }

    // Permitir resetar qualquer execução (incluindo PROCESSING e WAITING)
    // Isso permite reiniciar flows mesmo quando estão em execução
    const wasActive = execution.status === FlowStatus.PROCESSING || execution.status === FlowStatus.WAITING;
    
    if (wasActive) {
      console.log(`[Flow Engine] ⚠️ Resetando execução ATIVA (${execution.status}). Isso interromperá o flow em andamento.`);
    }

    // Buscar nó START
    const flowStructure = execution.flow.nodes as unknown as FlowNode[];
    const edges = execution.flow.edges as any[];
    const startNode = flowStructure.find((node) => node.type === 'START') as StartNode;

    if (!startNode) {
      throw new Error('Flow não possui nó START');
    }

    // Resetar execução
    // Preservar campaignId se existir (para manter vínculo com campanha)
    const currentContextData = execution.contextData as any;
    const resetContextData: any = {
      variables: {},
      userResponses: [],
      executedNodes: [],
      metadata: {
        resetAt: new Date(),
        previousStatus: execution.status,
      },
    };
    
    // Preservar campaignId se existir no contextData original
    if (currentContextData?.campaignId) {
      resetContextData.campaignId = currentContextData.campaignId;
      console.log(`[Flow Engine] 🔄 Preservando campaignId ${currentContextData.campaignId} no reset`);
    }

    await this.prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        status: FlowStatus.WAITING, // ✅ WAITING aguarda interação do contato
        currentNodeId: startNode.id,
        contextData: resetContextData as any,
        completedAt: null,
      },
    });

    console.log(`[Flow Engine] 🔄 Execução ${executionId} resetada. Preparada para reiniciar quando o contato interagir.`);
    if (resetContextData.campaignId) {
      console.log(`[Flow Engine] 🔄 Campanha vinculada: ${resetContextData.campaignId}`);
    }
    console.log(`[Flow Engine] ✅ Execução resetada com status WAITING. O flow será executado quando o contato enviar uma mensagem.`);

    // ✅ NÃO processar automaticamente aqui!
    // O processamento só acontecerá quando o contato interagir novamente (enviar mensagem)
    // Isso evita disparo automático de mensagens após o reset
  }

  /**
   * Executa flow a partir de um nó específico (para testes)
   */
  async executeFromNode(
    flowId: string,
    nodeId: string,
    contactId: string,
    organizationId: string
  ): Promise<string> {
    // Buscar flow
    const flow = await this.prisma.flow.findFirst({
      where: {
        id: flowId,
        organizationId,
      },
    });

    if (!flow) {
      throw new Error('Flow não encontrado');
    }

    const flowStructure = flow.nodes as unknown as FlowNode[];
    const edges = flow.edges as any[];

    // Verificar se o nó existe
    const targetNode = flowStructure.find((n) => n.id === nodeId);
    if (!targetNode) {
      throw new Error('Nó não encontrado no flow');
    }

    // Criar execução de teste
    const execution = await this.prisma.flowExecution.create({
      data: {
        contactId,
        flowId: flow.id,
        currentNodeId: nodeId,
        status: FlowStatus.PROCESSING,
        contextData: {
          variables: {},
          userResponses: [],
          executedNodes: [],
          isTestExecution: true,
        },
      },
    });

    // Processar a partir do nó
    await this.processNode(
      execution.id,
      nodeId,
      flowStructure,
      edges,
      execution.contextData as unknown as FlowContextData
    );

    return execution.id;
  }

  /**
   * Verifica se o trigger do nó START corresponde à mensagem recebida
   */
  private checkTriggerMatch(startNode: StartNode, message: string): boolean {
    const { triggerType, keyword } = startNode.config;
    const messageLower = message.trim().toLowerCase();
    const keywordLower = keyword?.toLowerCase() || '';

    console.log(`[Flow Engine] 🔍 Verificando trigger:`);
    console.log(`[Flow Engine]   - Tipo: ${triggerType}`);
    console.log(`[Flow Engine]   - Keyword: ${keyword || '(não definida)'}`);
    console.log(`[Flow Engine]   - Mensagem: "${message}"`);

    let result = false;

    switch (triggerType) {
      case 'KEYWORD_EXACT':
        result = messageLower === keywordLower;
        console.log(`[Flow Engine]   - KEYWORD_EXACT: "${messageLower}" === "${keywordLower}" = ${result}`);
        break;
      
      case 'KEYWORD_CONTAINS':
        result = messageLower.includes(keywordLower);
        console.log(`[Flow Engine]   - KEYWORD_CONTAINS: "${messageLower}".includes("${keywordLower}") = ${result}`);
        break;
      
      case 'KEYWORD_STARTS_WITH':
        result = messageLower.startsWith(keywordLower);
        console.log(`[Flow Engine]   - KEYWORD_STARTS_WITH: "${messageLower}".startsWith("${keywordLower}") = ${result}`);
        break;
      
      case 'ANY_RESPONSE':
        result = message.trim().length > 0; // Qualquer mensagem não vazia
        console.log(`[Flow Engine]   - ANY_RESPONSE: mensagem não vazia = ${result} (tamanho: ${message.trim().length})`);
        break;
      
      case 'TIMER':
        // TIMER não é verificado aqui, será processado quando campanha iniciar
        result = false;
        console.log(`[Flow Engine]   - TIMER: não disparado por mensagem recebida`);
        break;
      
      case 'WEBHOOK':
      case 'MANUAL':
        // Estes tipos não são disparados por mensagens recebidas
        result = false;
        console.log(`[Flow Engine]   - ${triggerType}: não disparado por mensagem recebida`);
        break;
      
      default:
        // Compatibilidade com código antigo (KEYWORD)
        if (keyword) {
          result = messageLower === keywordLower || messageLower.includes(keywordLower);
          console.log(`[Flow Engine]   - KEYWORD (legacy): "${messageLower}" === "${keywordLower}" || includes = ${result}`);
        } else {
          result = false;
          console.log(`[Flow Engine]   - Tipo desconhecido: ${triggerType}`);
        }
        break;
    }

    return result;
  }

  /**
   * Processa um nó específico do flow
   */
  private async processNode(
    executionId: string,
    nodeId: string,
    nodes: FlowNode[],
    edges: any[],
    contextData: FlowContextData
  ): Promise<void> {
    // Criar chave única para rastrear processamento: executionId + nodeId
    const processingKey = `${executionId}-${nodeId}`;
    
    // Buscar o nó ANTES de verificar processamento (para saber o tipo)
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`Nó não encontrado: ${nodeId}`);
    }
    
    const isStartNode = node.type === 'START';
    
    // Verificar se este nó já está sendo processado para esta execução
    // ✅ EXCEÇÃO: Se o nó é START e está sendo chamado de continueFlowExecution (após reset),
    // permitir processar mesmo se já estiver na lista (pode ser um caso legítimo de retry)
    if (this.processingNodes.has(processingKey)) {
      if (isStartNode) {
        console.log(`[Flow Engine] ⚠️ Nó START ${nodeId} já está sendo processado, mas permitindo processamento (pode ser retry após reset)`);
        // Remover da lista para permitir reprocessamento
        this.processingNodes.delete(processingKey);
      } else {
        console.log(`[Flow Engine] ⚠️ Nó ${nodeId} já está sendo processado para execução ${executionId}. Ignorando chamada duplicada.`);
        return;
      }
    }

    // Marcar como sendo processado
    this.processingNodes.add(processingKey);
    console.log(`[Flow Engine] 🔄 Iniciando processamento do nó ${nodeId} (execução ${executionId}, tipo: ${node.type})`);

    try {
      // CRÍTICO: SEMPRE buscar contextData do banco ANTES de processar
      // Isso garante que o campaignId esteja sempre presente, mesmo se foi perdido no parâmetro
      const currentExecution = await this.prisma.flowExecution.findUnique({
        where: { id: executionId },
        select: { contextData: true },
      });
      
      if (!currentExecution) {
        throw new Error(`Execução ${executionId} não encontrada`);
      }
      
      const currentContextData = currentExecution.contextData as any;
      const existingCampaignId = currentContextData?.campaignId;
      
      // CRÍTICO: SEMPRE usar o contextData do banco como fonte da verdade para campaignId
      // O campaignId DEVE estar sempre presente se foi salvo na criação
      if (existingCampaignId) {
        (contextData as any).campaignId = existingCampaignId;
        console.log(`[Flow Engine] 🔒🔒🔒 CampaignId RECUPERADO do banco no processNode: ${existingCampaignId}`);
      } else {
        // Se não encontrou no banco, verificar se está no parâmetro
        const paramCampaignId = (contextData as any).campaignId;
        if (paramCampaignId) {
          console.log(`[Flow Engine] ⚠️ CampaignId não encontrado no banco, mas está no parâmetro: ${paramCampaignId}`);
          console.log(`[Flow Engine] ⚠️ Isso pode indicar que o campaignId foi perdido em uma atualização anterior!`);
        } else {
          console.error(`[Flow Engine] ❌❌❌ ERRO: CampaignId NÃO encontrado nem no banco nem no parâmetro!`);
          console.error(`[Flow Engine] ❌ ContextData do banco:`, JSON.stringify(currentContextData, null, 2));
        }
      }
      
      // Preservar outras propriedades do banco que podem ter sido atualizadas
      if (currentContextData) {
        if (currentContextData.variables) {
          contextData.variables = { ...currentContextData.variables, ...contextData.variables };
        }
        if (currentContextData.userResponses && Array.isArray(currentContextData.userResponses)) {
          // Mesclar userResponses, evitando duplicatas
          const existingResponses = currentContextData.userResponses || [];
          const newResponses = contextData.userResponses || [];
          const mergedResponses = [...existingResponses];
          for (const newResp of newResponses) {
            if (!mergedResponses.find(r => r.nodeId === newResp.nodeId && r.timestamp === newResp.timestamp)) {
              mergedResponses.push(newResp);
            }
          }
          contextData.userResponses = mergedResponses;
        }
      }
      
      // ✅ node já foi encontrado no início do método, não precisa buscar novamente
      if (!node) {
        throw new Error(`Nó não encontrado: ${nodeId}`);
      }

      // Registrar execução do nó
      if (!contextData.executedNodes) {
        contextData.executedNodes = [];
      }
      contextData.executedNodes.push({
        nodeId: node.id,
        timestamp: new Date(),
        nodeType: node.type,
      });
      
      // Usar updateMany para evitar lock de linha (melhor performance)
      try {
        await this.prisma.flowExecution.updateMany({
          where: { id: executionId },
          data: {
            currentNodeId: nodeId, // Atualizar currentNodeId para o nó atual
            contextData: contextData as any,
          },
        });
        console.log(`[Flow Engine] 📝 currentNodeId atualizado para: ${nodeId}`);
        if ((contextData as any).campaignId) {
          console.log(`[Flow Engine] 📝 CampaignId preservado: ${(contextData as any).campaignId}`);
        }
      } catch (error) {
        // Se falhar, continuar execução (não é crítico)
        console.warn(`[Flow Engine] Erro ao atualizar contextData/currentNodeId:`, error);
      }

      // Processar baseado no tipo do nó
      switch (node.type) {
      case 'START':
        await this.processStartNode(executionId, node as StartNode, nodes, edges, contextData);
        break;

      case 'MESSAGE':
        await this.processMessageNode(executionId, node as MessageNode, nodes, edges, contextData);
        break;

      case 'MEDIA':
        await this.processMediaNode(executionId, node as MediaNode, nodes, edges, contextData);
        break;

      case 'ACTION':
        await this.processActionNode(executionId, node as ActionNode, nodes, edges, contextData);
        break;

      case 'TIMER':
        await this.processTimerNode(executionId, node as TimerNode, nodes, edges, contextData);
        break;

      case 'HTTP':
        await this.processHttpNode(executionId, node as HttpNode, nodes, edges, contextData);
        break;

      case 'AI':
        await this.processAINode(executionId, node as AINode, nodes, edges, contextData);
        break;

      case 'CONDITION':
        await this.processConditionNode(executionId, node as ConditionNode, nodes, edges, contextData);
        break;

      case 'END':
        await this.processEndNode(executionId, node as EndNode, contextData);
        break;

      default:
        throw new Error(`Tipo de nó não suportado: ${(node as any).type}`);
    }
    } catch (error: any) {
      console.error(`[Flow Engine] ❌ Erro ao processar nó ${nodeId} (execução ${executionId}):`, error.message);
      console.error(`[Flow Engine]   - Stack:`, error.stack);
      // Re-lançar erro após remover da lista de processamento
      this.processingNodes.delete(processingKey);
      throw error;
    } finally {
      // Remover da lista de processamento após concluir (ou em caso de erro)
      this.processingNodes.delete(processingKey);
      console.log(`[Flow Engine] ✅ Processamento do nó ${nodeId} concluído (execução ${executionId})`);
    }
  }

  /**
   * Busca instância ativa da organização ou da campanha
   */
  private async getActiveInstance(
    organizationId: string,
    campaignId?: string
  ): Promise<{ instanceName?: string; apiUrl?: string; apiKey?: string }> {
    let instanceName: string | undefined;
    let apiUrl: string | undefined;
    let apiKey: string | undefined;

    // Primeiro, tentar buscar instância da campanha
    if (campaignId) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { evolutionInstance: true },
      });

      if (campaign?.evolutionInstance) {
        instanceName = campaign.evolutionInstance.instanceName;
        apiUrl = campaign.evolutionInstance.apiUrl;
        apiKey = campaign.evolutionInstance.apiKey || undefined;
        return { instanceName, apiUrl, apiKey };
      }
    }

    // Se não encontrou instância da campanha, buscar uma instância ativa da organização
    const activeInstance = await this.prisma.evolutionInstance.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (activeInstance) {
      instanceName = activeInstance.instanceName;
      apiUrl = activeInstance.apiUrl;
      apiKey = activeInstance.apiKey || undefined;
      return { instanceName, apiUrl, apiKey };
    }

    // Retornar vazio se não encontrou nenhuma instância
    return { instanceName, apiUrl, apiKey };
  }

  /**
   * Processa nó START
   */
  private async processStartNode(
    executionId: string,
    node: StartNode,
    nodes: FlowNode[],
    edges: any[],
    contextData: FlowContextData
  ): Promise<void> {
    console.log(`[Flow Engine] 🚀🚀🚀 INICIANDO processStartNode`);
    console.log(`[Flow Engine] 🚀 Execução: ${executionId}`);
    console.log(`[Flow Engine] 🚀 Nó START ID: ${node.id}`);
    console.log(`[Flow Engine] 🚀 Total de edges: ${edges.length}`);
    console.log(`[Flow Engine] 🚀 Edges saindo do START:`, edges.filter(e => e.source === node.id).map(e => ({ id: e.id, target: e.target })));
    
    // Nó START apenas inicia o flow, avança para o próximo nó
    const nextEdge = edges.find((edge) => edge.source === node.id);
    
    if (nextEdge) {
      console.log(`[Flow Engine] ✅✅✅ Edge encontrada! Avançando para próximo nó`);
      console.log(`[Flow Engine] ✅ Edge ID: ${nextEdge.id}`);
      console.log(`[Flow Engine] ✅ Nó atual (START): ${node.id}`);
      console.log(`[Flow Engine] ✅ Próximo nó ID: ${nextEdge.target}`);
      
      // Verificar se o próximo nó existe
      const nextNode = nodes.find(n => n.id === nextEdge.target);
      if (!nextNode) {
        console.error(`[Flow Engine] ❌❌❌ Próximo nó ${nextEdge.target} NÃO encontrado na lista de nós!`);
        throw new Error(`Próximo nó não encontrado: ${nextEdge.target}`);
      }
      console.log(`[Flow Engine] ✅ Próximo nó encontrado: ${nextNode.id} (tipo: ${nextNode.type})`);
      
      // CRÍTICO: Garantir que contextData está atualizado no banco antes de processar próximo nó
      // Buscar contextData mais recente do banco
      const currentExecution = await this.prisma.flowExecution.findUnique({
        where: { id: executionId },
        select: { contextData: true },
      });
      
      if (currentExecution?.contextData) {
        const latestContextData = currentExecution.contextData as any;
        // Mesclar com o contextData passado, priorizando o do banco
        if (latestContextData.campaignId) {
          (contextData as any).campaignId = latestContextData.campaignId;
        }
        if (latestContextData.variables) {
          contextData.variables = { ...latestContextData.variables, ...contextData.variables };
        }
        console.log(`[Flow Engine] 🔒 ContextData atualizado do banco antes de processar próximo nó`);
      }
      
      // Processar próximo nó de forma assíncrona para não bloquear
      // Mas aguardar sua conclusão antes de finalizar o START
      try {
        console.log(`[Flow Engine] 🔄 Chamando processNode para próximo nó: ${nextEdge.target}`);
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
        console.log(`[Flow Engine] ✅✅✅ Próximo nó processado com sucesso após START`);
      } catch (error: any) {
        console.error(`[Flow Engine] ❌❌❌ Erro ao processar próximo nó após START:`, error.message);
        console.error(`[Flow Engine] ❌ Stack trace:`, error.stack);
        throw error;
      }
    } else {
      console.warn(`[Flow Engine] ⚠️ Nenhuma edge encontrada saindo do nó START ${node.id}. Flow não pode continuar.`);
      // Se não há próximo nó, finalizar execução
      await this.completeExecution(executionId);
    }
    
    console.log(`[Flow Engine] 🚀🚀🚀 FINALIZANDO processStartNode`);
  }

  /**
   * Processa nó MESSAGE (envia mensagem de texto)
   */
  private async processMessageNode(
    executionId: string,
    node: MessageNode,
    nodes: FlowNode[],
    edges: any[],
    contextData: FlowContextData
  ): Promise<void> {
    const execution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId },
      include: { contact: true, flow: { include: { organization: true } } },
    });

    if (!execution) return;

    // Substituir variáveis no texto
    let messageText = node.config.text;
    if (node.config.variables && contextData.variables) {
      for (const variable of node.config.variables) {
        const value = contextData.variables[variable];
        if (value !== undefined) {
          messageText = messageText.replace(
            new RegExp(`{{${variable}}}`, 'g'),
            String(value)
          );
        }
      }
    }

    // Buscar instância ativa
    const campaignId = (contextData as any).campaignId;
    const { instanceName, apiUrl, apiKey } = await this.getActiveInstance(
      execution.flow.organizationId,
      campaignId
    );

    // Fallback: usar apiKeyEvolution da organização se não encontrou instância
    const finalApiKey = apiKey || execution.flow.organization.apiKeyEvolution || undefined;
    if (!finalApiKey) {
      console.warn(`[Flow Engine] Nenhuma API Key encontrada para organização ${execution.flow.organizationId}`);
    }

    // Enfileirar mensagem para envio
    await this.messageQueue.enqueueMessage({
      phone: execution.contact.phone,
      message: messageText,
      organizationId: execution.flow.organizationId,
      apiKey: finalApiKey,
      instanceName,
      apiUrl,
    });

    // Avançar para próximo nó
    const nextEdge = edges.find((edge) => edge.source === node.id);
    if (nextEdge) {
      await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
    } else {
      await this.completeExecution(executionId);
    }
  }

  /**
   * Processa nó MEDIA (envia mídia)
   */
  private async processMediaNode(
    executionId: string,
    node: MediaNode,
    nodes: FlowNode[],
    edges: any[],
    contextData: FlowContextData
  ): Promise<void> {
    console.log(`[Flow Engine] 📷 Processando nó MEDIA: ${node.id}`);
    
    const execution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId },
      include: { contact: true, flow: { include: { organization: true } } },
    });

    if (!execution) {
      console.error(`[Flow Engine] ❌ Execução não encontrada: ${executionId}`);
      return;
    }

    // Validar URL da mídia (aceitar url ou mediaUrl)
    const mediaUrl = node.config.url || node.config.mediaUrl || '';
    if (!mediaUrl || mediaUrl.trim() === '') {
      console.warn(`[Flow Engine] ⚠️ URL de mídia não configurada no nó ${node.id}. Avançando para próximo nó.`);
      
      // Avançar para próximo nó mesmo sem URL
      const nextEdge = edges.find((edge) => edge.source === node.id);
      if (nextEdge) {
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
      } else {
        await this.completeExecution(executionId);
      }
      return;
    }

    // Validar mediaType
    let mediaType = node.config.mediaType || 'IMAGE';
    if (!['IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO'].includes(mediaType)) {
      console.warn(`[Flow Engine] ⚠️ Tipo de mídia inválido no nó ${node.id}: ${mediaType}. Usando IMAGE como padrão.`);
      mediaType = 'IMAGE';
    }

    // Converter URL relativa para absoluta se necessário
    let finalMediaUrl = mediaUrl;
    if (mediaUrl.startsWith('/uploads/') || (mediaUrl.startsWith('/') && !mediaUrl.startsWith('//'))) {
      // URL relativa - converter para absoluta usando a URL base da API
      const apiUrl = process.env.API_URL || 'http://localhost:3000';
      finalMediaUrl = `${apiUrl}${mediaUrl}`;
      console.log(`[Flow Engine] 🔄 Convertendo URL relativa para absoluta: ${mediaUrl} -> ${finalMediaUrl}`);
    }

    // Validar formato de URL
    try {
      const urlObj = new URL(finalMediaUrl);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('URL deve usar protocolo http ou https');
      }
    } catch (error: any) {
      console.error(`[Flow Engine] ❌ URL de mídia inválida: ${finalMediaUrl}`, error.message);
      
      // Avançar para próximo nó mesmo com URL inválida
      const nextEdge = edges.find((edge) => edge.source === node.id);
      if (nextEdge) {
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
      } else {
        await this.completeExecution(executionId);
      }
      return;
    }

    try {
      // Buscar instância ativa
      const campaignId = (contextData as any).campaignId;
      const { instanceName, apiUrl, apiKey } = await this.getActiveInstance(
        execution.flow.organizationId,
        campaignId
      );

      // Fallback: usar apiKeyEvolution da organização se não encontrou instância
      const finalApiKey = apiKey || execution.flow.organization.apiKeyEvolution || undefined;
      
      if (!finalApiKey) {
        console.warn(`[Flow Engine] ⚠️ Nenhuma API Key encontrada para organização ${execution.flow.organizationId}`);
        console.warn(`[Flow Engine] ⚠️ Avançando para próximo nó sem enviar mídia`);
        
        // Avançar para próximo nó mesmo sem API Key
        const nextEdge = edges.find((edge) => edge.source === node.id);
        if (nextEdge) {
          await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
        } else {
          await this.completeExecution(executionId);
        }
        return;
      }

      console.log(`[Flow Engine] 📤 Enfileirando mídia para envio:`);
      console.log(`[Flow Engine]   - Tipo: ${mediaType}`);
      console.log(`[Flow Engine]   - URL original: ${mediaUrl}`);
      console.log(`[Flow Engine]   - URL final: ${finalMediaUrl}`);
      console.log(`[Flow Engine]   - Instância: ${instanceName || 'default'}`);
      console.log(`[Flow Engine]   - API URL: ${apiUrl || 'default'}`);

      // Enfileirar mídia para envio
      await this.messageQueue.enqueueMedia({
        phone: execution.contact.phone,
        mediaType: mediaType as 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO',
        url: finalMediaUrl,
        caption: node.config.caption,
        fileName: node.config.fileName,
        organizationId: execution.flow.organizationId,
        apiKey: finalApiKey,
        instanceName,
        apiUrl,
      });

      console.log(`[Flow Engine] ✅ Mídia enfileirada com sucesso para ${execution.contact.phone}`);

      // Avançar para próximo nó
      const nextEdge = edges.find((edge) => edge.source === node.id);
      if (nextEdge) {
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
      } else {
        await this.completeExecution(executionId);
      }
    } catch (error: any) {
      console.error(`[Flow Engine] ❌ Erro ao processar nó MEDIA ${node.id}:`, error);
      console.error(`[Flow Engine]   - Tipo de erro: ${error.constructor.name}`);
      console.error(`[Flow Engine]   - Mensagem: ${error.message}`);
      
      // Verificar tipo de erro
      if (error.message?.includes('API Key')) {
        console.error(`[Flow Engine]   - Erro de autenticação: API Key não configurada ou inválida`);
      } else if (error.message?.includes('timeout') || error.message?.includes('TIMEOUT')) {
        console.error(`[Flow Engine]   - Erro de timeout: URL pode estar inacessível ou muito lenta`);
      } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('EAI_AGAIN')) {
        console.error(`[Flow Engine]   - Erro de rede: Não foi possível resolver o host da URL`);
      } else {
        console.error(`[Flow Engine]   - Erro desconhecido: ${JSON.stringify(error)}`);
      }

      // Marcar erro no contextData para logs
      if (!contextData.metadata) {
        contextData.metadata = {};
      }
      if (!contextData.metadata.errors) {
        contextData.metadata.errors = [];
      }
      contextData.metadata.errors.push({
        nodeId: node.id,
        nodeType: 'MEDIA',
        timestamp: new Date(),
        error: error.message,
      });

      // Atualizar contextData no banco
      try {
        await this.prisma.flowExecution.update({
          where: { id: executionId },
          data: {
            contextData: contextData as any,
          },
        });
      } catch (updateError) {
        console.error(`[Flow Engine] ⚠️ Erro ao atualizar contextData:`, updateError);
      }

      // Avançar para próximo nó mesmo com erro (não parar o flow)
      console.log(`[Flow Engine] ⚠️ Avançando para próximo nó apesar do erro`);
      const nextEdge = edges.find((edge) => edge.source === node.id);
      if (nextEdge) {
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
      } else {
        await this.completeExecution(executionId);
      }
    }
  }

  /**
   * Processa nó ACTION (pausa e aguarda resposta)
   */
  private async processActionNode(
    executionId: string,
    node: ActionNode,
    _nodes: FlowNode[],
    _edges: any[],
    contextData: FlowContextData
  ): Promise<void> {
    // Atualizar execução para WAITING e salvar contexto
    await this.prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        currentNodeId: node.id,
        status: FlowStatus.WAITING,
        contextData: contextData as any,
      },
    });

    // Se houver timeout configurado, agendar timeout
    if (node.config.timeout) {
      // TODO: Implementar timeout usando BullMQ delayed jobs
      // Por enquanto, apenas pausa e aguarda resposta manual
    }
  }

  /**
   * Processa nó TIMER (aguarda intervalo antes do próximo nó)
   */
  private async processTimerNode(
    executionId: string,
    node: TimerNode,
    nodes: FlowNode[],
    edges: any[],
    contextData: FlowContextData
  ): Promise<void> {
    // Calcular delay total em milissegundos
    const delaySeconds = node.config.delaySeconds || 0;
    const delayMinutes = node.config.delayMinutes || 0;
    const delayHours = node.config.delayHours || 0;
    
    const totalDelayMs = (delaySeconds + delayMinutes * 60 + delayHours * 3600) * 1000;

    if (totalDelayMs <= 0) {
      // Sem delay configurado, avançar imediatamente
      const nextEdge = edges.find((edge) => edge.source === node.id);
      if (nextEdge) {
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
      } else {
        await this.completeExecution(executionId);
      }
      return;
    }

    // Atualizar execução para WAITING durante o delay
    await this.prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        currentNodeId: node.id,
        status: FlowStatus.WAITING,
        contextData: contextData as any,
      },
    });

    // Agendar avanço para o próximo nó após o delay
    setTimeout(async () => {
      // Verificar se a execução ainda existe e está ativa
      const execution = await this.prisma.flowExecution.findUnique({
        where: { id: executionId },
      });

      if (!execution || execution.status === FlowStatus.COMPLETED || execution.status === FlowStatus.ABANDONED) {
        return; // Execução já finalizada ou abandonada
      }

      // Atualizar status para PROCESSING
      await this.prisma.flowExecution.update({
        where: { id: executionId },
        data: { status: FlowStatus.PROCESSING },
      });

      // Avançar para próximo nó
      const nextEdge = edges.find((edge) => edge.source === node.id);
      if (nextEdge) {
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
      } else {
        await this.completeExecution(executionId);
      }
    }, totalDelayMs);
  }

  /**
   * Processa nó HTTP (chama webhook externo)
   */
  private async processHttpNode(
    executionId: string,
    node: HttpNode,
    nodes: FlowNode[],
    edges: any[],
    contextData: FlowContextData
  ): Promise<void> {
    try {
      // Substituir variáveis na URL e body
      let url = node.config.url;
      let body = node.config.body;

      if (contextData.variables) {
        // Substituir variáveis na URL
        for (const [key, value] of Object.entries(contextData.variables)) {
          url = url.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }

        // Substituir variáveis no body (se body estiver definido)
        if (body !== undefined) {
          if (typeof body === 'string') {
            // Tentar parsear como JSON primeiro
            try {
              const parsed = JSON.parse(body);
              // Se for objeto, processar como objeto
              if (typeof parsed === 'object') {
                body = JSON.parse(
                  JSON.stringify(parsed).replace(
                    /\{\{(\w+)\}\}/g,
                    (match, key) => String(contextData.variables[key] || match)
                  )
                );
              } else {
                // Se não for objeto, substituir variáveis na string
                for (const [key, value] of Object.entries(contextData.variables)) {
                  body = body.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
                }
              }
            } catch {
              // Se não for JSON válido, tratar como string simples
              if (body !== undefined && typeof body === 'string') {
                for (const [key, value] of Object.entries(contextData.variables)) {
                  body = body.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
                }
              }
            }
          } else if (typeof body === 'object' && body !== null) {
            body = JSON.parse(
              JSON.stringify(body).replace(
                /\{\{(\w+)\}\}/g,
                (match, key) => String(contextData.variables[key] || match)
              )
            );
          }
        }
      }

      // Fazer requisição HTTP
      const response = await this.httpService.request({
        method: node.config.method,
        url,
        headers: node.config.headers,
        body: body !== undefined ? body : undefined,
        timeout: node.config.timeout,
      });

      // Salvar resposta no contexto se configurado
      if (node.config.saveResponseAs && contextData.variables) {
        contextData.variables[node.config.saveResponseAs] = response;
      }

      // Avançar para próximo nó
      const nextEdge = edges.find((edge) => edge.source === node.id);
      if (nextEdge) {
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
      } else {
        await this.completeExecution(executionId);
      }
    } catch (error) {
      console.error(`Erro ao processar HTTP node ${node.id}:`, error);
      
      // Em caso de erro, avançar para próximo nó ou finalizar
      const nextEdge = edges.find((edge) => edge.source === node.id);
      if (nextEdge) {
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
      } else {
        await this.completeExecution(executionId);
      }
    }
  }

  /**
   * Processa nó AI (chama LLM)
   */
  private async processAINode(
    executionId: string,
    node: AINode,
    nodes: FlowNode[],
    edges: any[],
    contextData: FlowContextData
  ): Promise<void> {
    try {
      // Preparar prompt com variáveis do contexto
      let userPrompt = node.config.userPrompt;
      if (contextData.variables) {
        for (const [key, value] of Object.entries(contextData.variables)) {
          userPrompt = userPrompt.replace(
            new RegExp(`{{${key}}}`, 'g'),
            String(value)
          );
        }
      }

      // Adicionar variáveis de contexto se configurado
      const contextMessages: any[] = [];
      if (node.config.contextVariables && contextData.variables) {
        for (const varName of node.config.contextVariables) {
          const value = contextData.variables[varName];
          if (value !== undefined) {
            contextMessages.push({
              role: 'user',
              content: `${varName}: ${value}`,
            });
          }
        }
      }

      // Chamar serviço de IA
      const aiResponse = await this.aiService.generateResponse({
        provider: node.config.provider,
        model: node.config.model,
        systemPrompt: node.config.systemPrompt,
        userPrompt,
        contextMessages,
        temperature: node.config.temperature,
        maxTokens: node.config.maxTokens,
      });

      // Salvar resposta no contexto
      if (node.config.saveResponseAs && contextData.variables) {
        contextData.variables[node.config.saveResponseAs] = aiResponse;
      }

      // Classificação inteligente (se configurada)
      let classificationResult: string | null = null;
      if (node.config.classificationMode && node.config.classificationMode !== 'NONE') {
        console.log(`[Flow Engine] 🧠 Classificando resposta da IA (modo: ${node.config.classificationMode})`);
        
        try {
          if (node.config.classificationMode === 'SENTIMENT') {
            const sentiment = await this.classificationService.classifyBySentiment(
              aiResponse,
              node.config.classificationConfig || {}
            );
            classificationResult = sentiment;
            console.log(`[Flow Engine] 📊 Classificação por sentimento: ${sentiment}`);
          } else if (node.config.classificationMode === 'KEYWORDS') {
            const keywordLabel = await this.classificationService.classifyByKeywords(
              aiResponse,
              node.config.classificationConfig || {}
            );
            classificationResult = keywordLabel || null;
            console.log(`[Flow Engine] 🔑 Classificação por palavras-chave: ${keywordLabel || 'nenhuma correspondência'}`);
          } else if (node.config.classificationMode === 'CUSTOM') {
            // Para classificação customizada, usar a última mensagem do usuário como contexto
            const lastUserMessage = contextData.userResponses?.[contextData.userResponses.length - 1]?.response || '';
            const customLabel = await this.classificationService.classifyByCustom(
              lastUserMessage,
              aiResponse,
              node.config.classificationConfig || {},
              this.aiService
            );
            classificationResult = customLabel;
            console.log(`[Flow Engine] 🎯 Classificação customizada: ${customLabel}`);
          }

          // Salvar classificação no contextData
          if (!contextData.metadata) {
            contextData.metadata = {};
          }
          contextData.metadata.aiClassification = {
            nodeId: node.id,
            mode: node.config.classificationMode,
            result: classificationResult,
            timestamp: new Date(),
          };
        } catch (error) {
          console.error(`[Flow Engine] ❌ Erro ao classificar resposta da IA:`, error);
        }
      }

      // Enviar resposta da IA como mensagem
      const execution = await this.prisma.flowExecution.findUnique({
        where: { id: executionId },
        include: { contact: true, flow: { include: { organization: true } } },
      });

      if (execution) {
        // Buscar instância ativa
        const campaignId = (contextData as any).campaignId;
        const { instanceName, apiUrl, apiKey } = await this.getActiveInstance(
          execution.flow.organizationId,
          campaignId
        );

        // Fallback: usar apiKeyEvolution da organização se não encontrou instância
        const finalApiKey = apiKey || execution.flow.organization.apiKeyEvolution || undefined;

        await this.messageQueue.enqueueMessage({
          phone: execution.contact.phone,
          message: aiResponse,
          organizationId: execution.flow.organizationId,
          apiKey: finalApiKey,
          instanceName,
          apiUrl,
        });
      }

      // Buscar edge baseado na classificação (se houver)
      let nextEdge: any = null;
      
      if (classificationResult) {
        // Procurar edge com label correspondente à classificação
        nextEdge = edges.find(
          (edge) => edge.source === node.id && edge.label?.toLowerCase() === classificationResult?.toLowerCase()
        );
        
        if (nextEdge) {
          console.log(`[Flow Engine] ✅ Edge encontrado com label "${classificationResult}"`);
        } else {
          console.log(`[Flow Engine] ⚠️ Nenhum edge encontrado com label "${classificationResult}". Usando primeiro edge disponível.`);
        }
      }

      // Se não encontrou edge por classificação, usar primeiro edge disponível
      if (!nextEdge) {
        nextEdge = edges.find((edge) => edge.source === node.id);
      }

      // Avançar para próximo nó
      if (nextEdge) {
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
      } else {
        await this.completeExecution(executionId);
      }
    } catch (error) {
      console.error(`Erro ao processar AI node ${node.id}:`, error);
      
      // Em caso de erro, avançar para próximo nó ou finalizar
      const nextEdge = edges.find((edge) => edge.source === node.id);
      if (nextEdge) {
        await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
      } else {
        await this.completeExecution(executionId);
      }
    }
  }

  /**
   * Processa nó CONDITION (decisão condicional)
   */
  private async processConditionNode(
    executionId: string,
    node: ConditionNode,
    nodes: FlowNode[],
    edges: any[],
    contextData: FlowContextData
  ): Promise<void> {
    const { condition } = node.config;
    const variableValue = contextData.variables?.[condition.variable];

    let conditionResult = false;

    switch (condition.operator) {
      case 'EQUALS':
        conditionResult = variableValue === condition.value;
        break;
      case 'CONTAINS':
        conditionResult = String(variableValue || '').includes(String(condition.value));
        break;
      case 'GREATER_THAN':
        conditionResult = Number(variableValue) > Number(condition.value);
        break;
      case 'LESS_THAN':
        conditionResult = Number(variableValue) < Number(condition.value);
        break;
      case 'EXISTS':
        conditionResult = variableValue !== undefined && variableValue !== null;
        break;
      case 'REGEX':
        const regex = new RegExp(condition.value);
        conditionResult = regex.test(String(variableValue || ''));
        break;
    }

    // Encontrar edge correspondente (true ou false)
    const nextEdge = edges.find(
      (edge) =>
        edge.source === node.id &&
        edge.sourceHandle === (conditionResult ? 'true' : 'false')
    );

    if (nextEdge) {
      await this.processNode(executionId, nextEdge.target, nodes, edges, contextData);
    } else {
      // Sem edge correspondente, finalizar execução
      await this.completeExecution(executionId);
    }
  }

  /**
   * Processa nó END (finaliza flow)
   */
  private async processEndNode(
    executionId: string,
    node: EndNode,
    contextData: FlowContextData
  ): Promise<void> {
    // CRÍTICO: Garantir que campaignId está no contextData antes de completar
    // Buscar execução atual para preservar campaignId se não estiver no contextData
    const currentExecution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId },
      select: { contextData: true },
    });
    
    const currentContextData = currentExecution?.contextData as any;
    const existingCampaignId = currentContextData?.campaignId;
    
    // CRÍTICO: SEMPRE preservar campaignId se existir no contextData original
    // Isso é ABSOLUTAMENTE ESSENCIAL para que a verificação funcione
    if (existingCampaignId) {
      (contextData as any).campaignId = existingCampaignId;
      console.log(`[Flow Engine] 🔒🔒🔒 CampaignId PRESERVADO no processEndNode: ${existingCampaignId}`);
    } else {
      console.log(`[Flow Engine] ⚠️⚠️⚠️ ATENÇÃO: Nenhum campaignId encontrado no contextData da execução ${executionId}!`);
      console.log(`[Flow Engine] ⚠️ ContextData atual:`, JSON.stringify(currentContextData, null, 2));
    }
    
    // Atualizar contextData no banco ANTES de completar para garantir que campaignId está salvo
    try {
      await this.prisma.flowExecution.update({
        where: { id: executionId },
        data: {
          contextData: contextData as any,
        },
      });
      const finalCampaignId = (contextData as any).campaignId;
      console.log(`[Flow Engine] 📝📝📝 ContextData atualizado no nó END. CampaignId: ${finalCampaignId || 'N/A'}`);
      if (!finalCampaignId) {
        console.error(`[Flow Engine] ❌❌❌ ERRO CRÍTICO: CampaignId NÃO está no contextData ao completar execução!`);
      }
    } catch (error) {
      console.error(`[Flow Engine] ❌ ERRO ao atualizar contextData no nó END:`, error);
    }
    
    // Enviar mensagem final se configurada
    if (node.config.message) {
      const execution = await this.prisma.flowExecution.findUnique({
        where: { id: executionId },
        include: { contact: true, flow: { include: { organization: true } } },
      });

      if (execution) {
        let messageText = node.config.message;
        if (contextData.variables) {
          for (const [key, value] of Object.entries(contextData.variables)) {
            messageText = messageText.replace(
              new RegExp(`{{${key}}}`, 'g'),
              String(value)
            );
          }
        }

        // Buscar instância ativa
        const campaignId = (contextData as any).campaignId;
        const { instanceName, apiUrl, apiKey } = await this.getActiveInstance(
          execution.flow.organizationId,
          campaignId
        );

        // Fallback: usar apiKeyEvolution da organização se não encontrou instância
        const finalApiKey = apiKey || execution.flow.organization.apiKeyEvolution || undefined;

        await this.messageQueue.enqueueMessage({
          phone: execution.contact.phone,
          message: messageText,
          organizationId: execution.flow.organizationId,
          apiKey: finalApiKey,
          instanceName,
          apiUrl,
        });
      }
    }

    // CRÍTICO: Buscar contextData do banco ANTES de completar para garantir que campaignId está presente
    const finalExecution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId },
      select: { contextData: true },
    });
    
    const finalContextData = finalExecution?.contextData as any;
    const finalCampaignId = finalContextData?.campaignId;
    
    if (!finalCampaignId) {
      console.error(`[Flow Engine] ❌❌❌ ERRO CRÍTICO: CampaignId NÃO encontrado no contextData antes de completar execução ${executionId}!`);
      console.error(`[Flow Engine] ❌ ContextData do banco:`, JSON.stringify(finalContextData, null, 2));
      console.error(`[Flow Engine] ❌ Tentando recuperar campaignId do contextData passado...`);
      
      // Tentar recuperar do contextData passado como parâmetro
      const paramCampaignId = (contextData as any).campaignId;
      if (paramCampaignId) {
        console.log(`[Flow Engine] 🔄 CampaignId encontrado no parâmetro: ${paramCampaignId}. Atualizando banco...`);
        await this.prisma.flowExecution.update({
          where: { id: executionId },
          data: {
            contextData: {
              ...finalContextData,
              campaignId: paramCampaignId,
            } as any,
          },
        });
        console.log(`[Flow Engine] ✅ CampaignId recuperado e salvo: ${paramCampaignId}`);
      }
    }
    
    await this.completeExecution(executionId);
  }

  /**
   * Finaliza execução do flow
   */
  private async completeExecution(executionId: string): Promise<void> {
    // Buscar execução COMPLETA para preservar contextData (incluindo campaignId)
    const execution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId },
      select: { 
        contextData: true,
        contactId: true,
        flowId: true,
      },
    });

    if (!execution) {
      console.error(`[Flow Engine] ❌ Execução ${executionId} não encontrada ao tentar completar!`);
      return;
    }

    // Preservar contextData existente ao marcar como COMPLETED
    let contextData = execution.contextData || {};
    const contextDataObj = contextData as any;
    let campaignId = contextDataObj?.campaignId;
    
    console.log(`[Flow Engine] 🏁 Completando execução ${executionId}:`);
    console.log(`[Flow Engine]   - Contato: ${execution.contactId}`);
    console.log(`[Flow Engine]   - Flow: ${execution.flowId}`);
    console.log(`[Flow Engine]   - CampaignId no contextData: ${campaignId || 'N/A'}`);
    console.log(`[Flow Engine]   - ContextData completo:`, JSON.stringify(contextData, null, 2));
    
    // CRÍTICO: Se não encontrou campaignId, tentar buscar de execuções anteriores ou do flow
    if (!campaignId) {
      console.error(`[Flow Engine] ❌❌❌ ERRO CRÍTICO: CampaignId NÃO encontrado no contextData!`);
      console.error(`[Flow Engine] ❌ Tentando recuperar de outras execuções do mesmo flow e contato...`);
      
      // Buscar outras execuções do mesmo flow e contato que tenham campaignId
      const otherExecutions = await this.prisma.flowExecution.findMany({
        where: {
          contactId: execution.contactId,
          flowId: execution.flowId,
          NOT: { id: executionId },
        },
        orderBy: { startedAt: 'desc' },
        take: 1,
        select: { contextData: true },
      });
      
      for (const otherExec of otherExecutions) {
        const otherContextData = otherExec.contextData as any;
        const otherCampaignId = otherContextData?.campaignId;
        if (otherCampaignId) {
          campaignId = otherCampaignId;
          (contextData as any).campaignId = campaignId;
          console.log(`[Flow Engine] 🔄 CampaignId recuperado de outra execução: ${campaignId}`);
          break;
        }
      }
      
      if (!campaignId) {
        console.error(`[Flow Engine] ❌❌❌ NÃO foi possível recuperar campaignId!`);
        console.error(`[Flow Engine] ❌ A verificação de bloqueio pode falhar!`);
      }
    }
    
    // Garantir que contextData tenha a estrutura correta
    if (!contextDataObj.variables) {
      (contextData as any).variables = {};
    }
    if (!contextDataObj.userResponses) {
      (contextData as any).userResponses = [];
    }
    if (!contextDataObj.executedNodes) {
      (contextData as any).executedNodes = [];
    }
    
    await this.prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        status: FlowStatus.COMPLETED,
        completedAt: new Date(),
        contextData: contextData, // Preservar contextData (incluindo campaignId)
      },
    });
    
    // Verificar novamente após salvar
    const savedExecution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId },
      select: { contextData: true },
    });
    
    const savedContextData = savedExecution?.contextData as any;
    const savedCampaignId = savedContextData?.campaignId;
    
    if (savedCampaignId) {
      console.log(`[Flow Engine] ✅✅✅ Execução ${executionId} marcada como COMPLETED. CampaignId confirmado salvo: ${savedCampaignId}`);
    } else {
      console.error(`[Flow Engine] ❌❌❌ Execução ${executionId} completada SEM campaignId após salvar!`);
      console.error(`[Flow Engine] ❌ ContextData salvo:`, JSON.stringify(savedContextData, null, 2));
      console.error(`[Flow Engine] ❌ A verificação de bloqueio FALHARÁ!`);
    }
  }

  /**
   * Verifica se pode iniciar um novo flow para um contato
   * Considera execuções COMPLETED recentes e cooldown configurado
   */
  private async canStartNewFlow(
    contactId: string,
    _organizationId: string
  ): Promise<{ canStart: boolean; reason?: string }> {
    // Buscar última execução COMPLETED para este contato
    const lastCompletedExecution = await this.prisma.flowExecution.findFirst({
      where: {
        contactId,
        status: FlowStatus.COMPLETED,
      },
      include: {
        flow: true,
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    if (!lastCompletedExecution) {
      // Não há execução completada, pode iniciar
      return { canStart: true };
    }

    // Verificar se o flow tem cooldown configurado
    const cooldownHours = (lastCompletedExecution.flow as any).cooldownHours;
    
    if (!cooldownHours || cooldownHours <= 0) {
      // Sem cooldown configurado, pode iniciar
      return { canStart: true };
    }

    // Verificar se passou o período de cooldown
    if (!lastCompletedExecution.completedAt) {
      // Execução completada mas sem data, permitir iniciar
      return { canStart: true };
    }

    const completedAt = new Date(lastCompletedExecution.completedAt);
    const now = new Date();
    const hoursSinceCompletion = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCompletion >= cooldownHours) {
      // Cooldown expirado, pode iniciar
      return { canStart: true };
    }

    // Cooldown ainda ativo
    const remainingHours = cooldownHours - hoursSinceCompletion;
    return {
      canStart: false,
      reason: `Cooldown ativo. Aguarde ${remainingHours.toFixed(1)} horas antes de iniciar novamente.`,
    };
  }

  /**
   * Abandona execução do flow (erro ou timeout)
   */
  private async abandonExecution(executionId: string): Promise<void> {
    await this.prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        status: FlowStatus.ABANDONED,
        completedAt: new Date(),
      },
    });
  }
}


