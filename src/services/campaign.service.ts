import { PrismaClient, CampaignStatus, LeadStatus } from '@prisma/client';
import { CampaignMessageContent } from '../types/campaign';

export class CampaignService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Criar nova campanha
   */
  async createCampaign(data: {
    name: string;
    description?: string;
    flowId?: string;
    instanceId?: string;
    instanceName?: string; // Mantido para compatibilidade
    organizationId: string;
    scheduledAt?: Date;
    messageContent?: CampaignMessageContent;
  }) {
    // Verificar se o flow existe e pertence à organização (se fornecido)
    if (data.flowId) {
      const flow = await this.prisma.flow.findFirst({
        where: {
          id: data.flowId,
          organizationId: data.organizationId,
        },
      });

      if (!flow) {
        throw new Error('Flow não encontrado ou não pertence à organização');
      }
    }

    // Se instanceId fornecido, verificar se a instância existe e pertence à organização
    if (data.instanceId) {
      const instance = await this.prisma.evolutionInstance.findFirst({
        where: {
          id: data.instanceId,
          organizationId: data.organizationId,
        },
      });

      if (!instance) {
        throw new Error('Instância não encontrada ou não pertence à organização');
      }
    }

    // Criar campanha
    const campaign = await this.prisma.campaign.create({
      data: {
        name: data.name,
        description: data.description,
        flowId: data.flowId,
        instanceId: data.instanceId,
        instanceName: data.instanceName || (data.instanceId ? undefined : data.instanceName), // Manter instanceName apenas se não houver instanceId
        messageContent: data.messageContent ? (data.messageContent as any) : undefined,
        organizationId: data.organizationId,
        status: data.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
        scheduledAt: data.scheduledAt,
      },
      include: {
        flow: true,
        organization: true,
      },
    });

    // Criar stats inicial
    await this.prisma.campaignStats.create({
      data: {
        campaignId: campaign.id,
        totalLeads: 0,
      },
    });

    return campaign;
  }

  /**
   * Listar campanhas por organização
   */
  async listCampaigns(organizationId: string, filters?: {
    status?: CampaignStatus;
    search?: string;
  }) {
    try {
      console.log('Listando campanhas para organização:', organizationId);
      console.log('Filtros:', filters);

      const where: any = {
        organizationId,
      };

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.search) {
        where.OR = [
          { name: { contains: filters.search } },
          { description: { contains: filters.search } },
        ];
      }

      console.log('Query where:', JSON.stringify(where, null, 2));

      const campaigns = await this.prisma.campaign.findMany({
        where,
        include: {
          flow: {
            select: {
              id: true,
              name: true,
            },
          },
          stats: true,
          _count: {
            select: {
              leads: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      console.log(`Encontradas ${campaigns.length} campanhas`);

      // Transformar os dados para garantir compatibilidade JSON
      const result = campaigns.map((campaign) => {
        try {
          const totalLeads =
            (campaign.stats && campaign.stats.totalLeads !== null
              ? campaign.stats.totalLeads
              : undefined) ?? campaign._count.leads ?? 0;

          return {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description || null,
            flowId: campaign.flowId,
            instanceName: campaign.instanceName,
            status: campaign.status,
            scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
            startedAt: campaign.startedAt ? campaign.startedAt.toISOString() : null,
            completedAt: campaign.completedAt ? campaign.completedAt.toISOString() : null,
            createdAt: campaign.createdAt.toISOString(),
            updatedAt: campaign.updatedAt.toISOString(),
            flow: campaign.flow,
            stats: campaign.stats ? {
              id: campaign.stats.id,
              campaignId: campaign.stats.campaignId,
              totalLeads: campaign.stats.totalLeads,
              sent: campaign.stats.sent,
              delivered: campaign.stats.delivered,
              read: campaign.stats.read,
              replied: campaign.stats.replied,
              error: campaign.stats.error,
              updatedAt: campaign.stats.updatedAt.toISOString(),
            } : null,
            totalLeads,
            _count: campaign._count,
          };
        } catch (mapError: any) {
          console.error('Erro ao mapear campanha:', campaign.id, mapError);
          throw mapError;
        }
      });

      return result;
    } catch (error: any) {
      console.error('Erro no serviço ao listar campanhas:', error);
      console.error('Mensagem:', error.message);
      console.error('Código:', error.code);
      console.error('Stack:', error.stack);
      if (error.meta) {
        console.error('Meta do Prisma:', JSON.stringify(error.meta, null, 2));
      }
      throw error;
    }
  }

  /**
   * Obter detalhes da campanha
   */
  async getCampaignById(campaignId: string, organizationId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
      include: {
        flow: true,
        stats: true,
        leads: {
          include: {
            contact: true,
          },
          take: 100, // Limitar para não sobrecarregar
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            leads: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    return campaign;
  }

  /**
   * Atualizar status da campanha
   */
  async updateCampaignStatus(
    campaignId: string,
    organizationId: string,
    status: CampaignStatus
  ) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    const updateData: any = {
      status,
    };

    if (status === CampaignStatus.RUNNING && !campaign.startedAt) {
      updateData.startedAt = new Date();
    }

    if (status === CampaignStatus.COMPLETED) {
      updateData.completedAt = new Date();
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: updateData,
    });
  }

  /**
   * Atualizar campanha
   */
  async updateCampaign(
    campaignId: string,
    organizationId: string,
    data: {
      name?: string;
      description?: string;
      flowId?: string;
      instanceId?: string;
      scheduledAt?: Date;
      messageContent?: CampaignMessageContent;
    }
  ) {
    // Verificar se campanha existe e pertence à organização
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    // Verificar se o flow existe e pertence à organização (se fornecido)
    if (data.flowId) {
      const flow = await this.prisma.flow.findFirst({
        where: {
          id: data.flowId,
          organizationId,
        },
      });

      if (!flow) {
        throw new Error('Flow não encontrado ou não pertence à organização');
      }
    }

    // Verificar se a instância existe e pertence à organização (se fornecido)
    if (data.instanceId) {
      const instance = await this.prisma.evolutionInstance.findFirst({
        where: {
          id: data.instanceId,
          organizationId,
        },
      });

      if (!instance) {
        throw new Error('Instância não encontrada ou não pertence à organização');
      }
    }

    // Atualizar campanha
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.flowId !== undefined) updateData.flowId = data.flowId;
    if (data.instanceId !== undefined) updateData.instanceId = data.instanceId;
    if (data.messageContent !== undefined) updateData.messageContent = data.messageContent as any;
    if (data.scheduledAt !== undefined) {
      updateData.scheduledAt = data.scheduledAt;
      // Se agendada e ainda em rascunho, atualizar status
      if (campaign.status === CampaignStatus.DRAFT && data.scheduledAt) {
        updateData.status = CampaignStatus.SCHEDULED;
      }
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: updateData,
      include: {
        flow: true,
        organization: true,
      },
    });
  }

  /**
   * Listar leads da campanha
   */
  async listCampaignLeads(campaignId: string, organizationId: string) {
    // Verificar se campanha existe e pertence à organização
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    return this.prisma.campaignLead.findMany({
      where: {
        campaignId,
      },
      include: {
        contact: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Adicionar lead manualmente à campanha
   */
  async addCampaignLead(
    campaignId: string,
    organizationId: string,
    contactId: string
  ) {
    // Verificar se campanha existe e pertence à organização
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    // Verificar se contato existe e pertence à organização
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId,
      },
    });

    if (!contact) {
      throw new Error('Contato não encontrado');
    }

    // Criar ou atualizar campaign lead
    const campaignLead = await this.prisma.campaignLead.upsert({
      where: {
        campaignId_contactId: {
          campaignId,
          contactId,
        },
      },
      create: {
        campaignId,
        contactId,
        status: LeadStatus.PENDING,
      },
      update: {
        status: LeadStatus.PENDING,
      },
      include: {
        contact: true,
      },
    });

    // Verificar se já existe (para não incrementar stats duas vezes)
    const existingLead = await this.prisma.campaignLead.findUnique({
      where: {
        campaignId_contactId: {
          campaignId,
          contactId,
        },
      },
    });

    // Atualizar stats apenas se for novo lead
    if (!existingLead) {
      await this.prisma.campaignStats.update({
        where: { campaignId },
        data: {
          totalLeads: {
            increment: 1,
          },
        },
      });
    }

    return campaignLead;
  }

  /**
   * Remover lead da campanha
   */
  async removeCampaignLead(
    campaignId: string,
    organizationId: string,
    leadId: string
  ) {
    // Verificar se lead existe e pertence à campanha da organização
    const lead = await this.prisma.campaignLead.findFirst({
      where: {
        id: leadId,
        campaign: {
          id: campaignId,
          organizationId,
        },
      },
    });

    if (!lead) {
      throw new Error('Lead não encontrado');
    }

    // Deletar lead
    await this.prisma.campaignLead.delete({
      where: { id: leadId },
    });

    // Atualizar stats
    await this.prisma.campaignStats.update({
      where: { campaignId },
      data: {
        totalLeads: {
          decrement: 1,
        },
      },
    });

    return { success: true };
  }

  /**
   * Deletar campanha
   */
  async deleteCampaign(campaignId: string, organizationId: string) {
    // Verificar se campanha existe e pertence à organização
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    // Não permitir deletar campanhas em execução
    if (campaign.status === CampaignStatus.RUNNING) {
      throw new Error('Não é possível deletar uma campanha em execução');
    }

    // Deletar campanha (cascade deletará leads e stats)
    await this.prisma.campaign.delete({
      where: { id: campaignId },
    });

    return { success: true };
  }

  /**
   * Adicionar leads à campanha
   */
  async addLeadsToCampaign(
    campaignId: string,
    organizationId: string,
    contactIds: string[]
  ) {
    // Verificar se campanha existe
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    // Verificar se contatos pertencem à organização
    const contacts = await this.prisma.contact.findMany({
      where: {
        id: { in: contactIds },
        organizationId,
      },
    });

    if (contacts.length !== contactIds.length) {
      throw new Error('Alguns contatos não foram encontrados');
    }

    // Criar campaign leads
    const campaignLeads = await Promise.all(
      contactIds.map((contactId) =>
        this.prisma.campaignLead.upsert({
          where: {
            campaignId_contactId: {
              campaignId,
              contactId,
            },
          },
          create: {
            campaignId,
            contactId,
            status: LeadStatus.PENDING,
          },
          update: {
            status: LeadStatus.PENDING,
          },
        })
      )
    );

    // Atualizar stats
    await this.prisma.campaignStats.update({
      where: { campaignId },
      data: {
        totalLeads: {
          increment: campaignLeads.length,
        },
      },
    });

    return campaignLeads;
  }

  /**
   * Obter estatísticas da campanha
   */
  async getCampaignStats(campaignId: string, organizationId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
      include: {
        stats: true,
        _count: {
          select: {
            leads: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    // Contar leads por status
    const leadsByStatus = await this.prisma.campaignLead.groupBy({
      by: ['status'],
      where: {
        campaignId,
      },
      _count: true,
    });

    const stats = {
      ...campaign.stats,
      leadsByStatus: leadsByStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<LeadStatus, number>),
      totalLeads: campaign._count.leads,
    };

    return stats;
  }

  /**
   * Resetar status dos leads e estatísticas da campanha
   */
  async resetCampaignLeadsAndStats(campaignId: string, organizationId: string) {
    // Verificar se campanha existe e pertence à organização
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    // Resetar todos os leads da campanha para PENDING
    await this.prisma.campaignLead.updateMany({
      where: {
        campaignId,
      },
      data: {
        status: LeadStatus.PENDING,
        sentAt: null,
        error: null,
      },
    });

    // Resetar estatísticas agregadas
    await this.prisma.campaignStats.updateMany({
      where: { campaignId },
      data: {
        sent: 0,
        delivered: 0,
        read: 0,
        replied: 0,
        error: 0,
      },
    });
  }
}

