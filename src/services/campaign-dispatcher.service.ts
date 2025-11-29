import { PrismaClient, LeadStatus } from '@prisma/client';
import { MessageQueueService } from './message-queue.service';
import { CampaignMessageContent } from '../types/campaign';

/**
 * Serviço responsável por disparar mensagens de campanhas
 */
export class CampaignDispatcherService {
  constructor(
    private prisma: PrismaClient,
    private messageQueue: MessageQueueService
  ) {}

  /**
   * Dispara uma campanha enviando mensagens para todos os leads pendentes
   */
  async dispatchCampaign(campaignId: string, organizationId: string): Promise<void> {
    // Buscar campanha com todas as informações necessárias
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
      include: {
        instance: true,
        leads: {
          where: {
            status: LeadStatus.PENDING,
          },
          include: {
            contact: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    if (!campaign.messageContent) {
      throw new Error('Campanha não possui conteúdo de mensagem configurado');
    }

    if (!campaign.instance) {
      throw new Error('Campanha não possui instância Evolution API configurada');
    }

    if (campaign.leads.length === 0) {
      throw new Error('Campanha não possui leads pendentes para envio');
    }

    const messageContent = campaign.messageContent as CampaignMessageContent;
    const instance = campaign.instance;

    // Processar cada lead
    for (const lead of campaign.leads) {
      try {
        await this.sendCampaignMessage(lead.contact, messageContent, instance);
        
        // Atualizar status do lead para SENT
        await this.prisma.campaignLead.update({
          where: { id: lead.id },
          data: { 
            status: LeadStatus.SENT,
            sentAt: new Date(),
          },
        });

        // Atualizar stats
        await this.prisma.campaignStats.update({
          where: { campaignId },
          data: {
            sent: {
              increment: 1,
            },
          },
        });
      } catch (error: any) {
        console.error(`Erro ao enviar mensagem para lead ${lead.id}:`, error);
        
        // Atualizar lead com erro
        await this.prisma.campaignLead.update({
          where: { id: lead.id },
          data: { 
            status: LeadStatus.ERROR,
            error: error.message || 'Erro ao enviar mensagem',
          },
        });

        // Atualizar stats de erro
        await this.prisma.campaignStats.update({
          where: { campaignId },
          data: {
            error: {
              increment: 1,
            },
          },
        });
      }
    }
  }

  /**
   * Envia mensagem da campanha para um contato específico
   */
  private async sendCampaignMessage(
    contact: any,
    content: CampaignMessageContent,
    instance: any
  ): Promise<void> {
    if (content.type === 'TEXT' && content.text) {
      // Substituir variáveis no texto
      const messageText = this.replaceVariables(content.text, contact);
      
      // Enfileirar mensagem de texto
      await this.messageQueue.enqueueMessage({
        phone: contact.phone,
        message: messageText,
        organizationId: contact.organizationId,
        apiKey: instance.apiKey || undefined,
        instanceName: instance.instanceName,
        apiUrl: instance.apiUrl,
      });
    } else if (content.type === 'MEDIA' && content.mediaUrl) {
      // Enfileirar mídia
      await this.messageQueue.enqueueMedia({
        phone: contact.phone,
        mediaType: content.mediaType || 'IMAGE',
        url: content.mediaUrl,
        caption: content.caption ? this.replaceVariables(content.caption, contact) : undefined,
        fileName: content.mediaUrl.split('/').pop(),
        organizationId: contact.organizationId,
        apiKey: instance.apiKey || undefined,
        instanceName: instance.instanceName,
        apiUrl: instance.apiUrl,
      });
    } else if (content.type === 'MULTI' && content.items) {
      // Enviar múltiplos blocos sequencialmente
      for (const item of content.items) {
        if (item.type === 'TEXT' && item.text) {
          const messageText = this.replaceVariables(item.text, contact);
          await this.messageQueue.enqueueMessage({
            phone: contact.phone,
            message: messageText,
            organizationId: contact.organizationId,
            apiKey: instance.apiKey || undefined,
            instanceName: instance.instanceName,
            apiUrl: instance.apiUrl,
          });
        } else if (item.type === 'MEDIA' && item.mediaUrl) {
          await this.messageQueue.enqueueMedia({
            phone: contact.phone,
            mediaType: (item.mediaType as any) || 'IMAGE',
            url: item.mediaUrl,
            caption: item.caption ? this.replaceVariables(item.caption, contact) : undefined,
            fileName: item.mediaUrl.split('/').pop(),
            organizationId: contact.organizationId,
            apiKey: instance.apiKey || undefined,
            instanceName: instance.instanceName,
            apiUrl: instance.apiUrl,
          });
        }
      }
    }
  }

  /**
   * Substitui variáveis no texto usando dados do contato
   */
  private replaceVariables(text: string, contact: any): string {
    let result = text;
    
    // Substituir {{nome}}
    if (contact.name) {
      result = result.replace(/\{\{nome\}\}/gi, contact.name);
    }
    
    // Substituir {{telefone}}
    if (contact.phone) {
      result = result.replace(/\{\{telefone\}\}/gi, contact.phone);
    }
    
    // Substituir {{email}}
    if (contact.email) {
      result = result.replace(/\{\{email\}\}/gi, contact.email);
    }
    
    return result;
  }
}





