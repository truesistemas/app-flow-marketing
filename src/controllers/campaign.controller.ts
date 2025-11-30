import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient, CampaignStatus } from '@prisma/client';
import { CampaignService } from '../services/campaign.service';
import { LeadImportService } from '../services/lead-import.service';
import { CampaignDispatcherService } from '../services/campaign-dispatcher.service';
import { MessageQueueService } from '../services/message-queue.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { MultipartFile } from '@fastify/multipart';

export class CampaignController {
  private campaignService: CampaignService;
  private leadImportService: LeadImportService;
  private campaignDispatcher: CampaignDispatcherService;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient, messageQueue: MessageQueueService) {
    this.prisma = prisma;
    this.campaignService = new CampaignService(prisma);
    this.leadImportService = new LeadImportService(prisma);
    this.campaignDispatcher = new CampaignDispatcherService(prisma, messageQueue);
  }

  /**
   * GET /api/campaigns
   * Listar campanhas
   */
  async listCampaigns(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { status, search } = request.query as {
        status?: string;
        search?: string;
      };

      // Validar status se fornecido
      let campaignStatus: CampaignStatus | undefined;
      if (status) {
        const validStatuses: CampaignStatus[] = [
          'DRAFT',
          'SCHEDULED',
          'RUNNING',
          'PAUSED',
          'COMPLETED',
          'CANCELLED',
        ];
        if (validStatuses.includes(status as CampaignStatus)) {
          campaignStatus = status as CampaignStatus;
        }
      }

      const campaigns = await this.campaignService.listCampaigns(
        request.user.organizationId,
        {
          status: campaignStatus,
          search: search || undefined,
        }
      );

      return reply.send({ campaigns });
    } catch (error: any) {
      console.error('Erro ao listar campanhas:', error);
      console.error('Stack:', error.stack);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return reply.code(500).send({ 
        error: 'Erro ao listar campanhas',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor'
      });
    }
  }

  /**
   * POST /api/campaigns
   * Criar campanha
   */
  async createCampaign(
    request: FastifyRequest<{
      Body: {
        name: string;
        description?: string;
        flowId?: string;
        instanceId?: string;
        instanceName?: string; // Mantido para compatibilidade
        scheduledAt?: string;
        messageContent?: any;
      };
    }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { name, description, flowId, instanceId, instanceName, scheduledAt, messageContent } = request.body;

      if (!name || (!instanceId && !instanceName)) {
        return reply.code(400).send({
          error: 'Nome e Instância são obrigatórios',
        });
      }

      const campaign = await this.campaignService.createCampaign({
        name,
        description,
        flowId,
        instanceId,
        instanceName,
        organizationId: authRequest.user.organizationId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        messageContent: messageContent,
      });

      return reply.code(201).send({ campaign });
    } catch (error: any) {
      if (error.message === 'Flow não encontrado ou não pertence à organização') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao criar campanha' });
    }
  }

  /**
   * GET /api/campaigns/:id
   * Detalhes da campanha
   */
  async getCampaign(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;

      const campaign = await this.campaignService.getCampaignById(
        id,
        authRequest.user.organizationId
      );

      return reply.send({ campaign });
    } catch (error: any) {
      if (error.message === 'Campanha não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao obter campanha' });
    }
  }

  /**
   * POST /api/campaigns/:id/import-leads
   * Importar leads
   */
  async importLeads(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({ error: 'Arquivo não fornecido' });
      }

      const buffer = await data.toBuffer();
      const filename = data.filename || '';

      let leads;

      // Processar arquivo baseado na extensão
      if (filename.endsWith('.csv')) {
        leads = await this.leadImportService.processCSV(buffer);
      } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        leads = await this.leadImportService.processExcel(buffer);
      } else {
        return reply.code(400).send({
          error: 'Formato de arquivo não suportado. Use CSV ou Excel',
        });
      }

      if (leads.length === 0) {
        return reply.code(400).send({ error: 'Nenhum lead válido encontrado no arquivo' });
      }

      // Criar ou atualizar contatos
      const contactIds = await this.leadImportService.createOrUpdateContacts(
        leads,
        authRequest.user.organizationId
      );

      // Adicionar leads à campanha
      await this.campaignService.addLeadsToCampaign(
        id,
        authRequest.user.organizationId,
        contactIds
      );

      return reply.send({
        message: `${leads.length} leads importados com sucesso`,
        imported: leads.length,
      });
    } catch (error: any) {
      if (
        error.message.includes('Campanha não encontrada') ||
        error.message.includes('contatos não foram encontrados')
      ) {
        return reply.code(404).send({ error: error.message });
      }
      if (
        error.message.includes('Coluna') ||
        error.message.includes('Arquivo')
      ) {
        return reply.code(400).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao importar leads' });
    }
  }

  /**
   * POST /api/campaigns/:id/start
   * Iniciar campanha
   */
  async startCampaign(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;

      // Validar que campanha tem conteúdo e leads
      const campaign = await this.campaignService.getCampaignById(
        id,
        authRequest.user.organizationId
      );

      if (!campaign.messageContent) {
        return reply.code(400).send({ error: 'Campanha não possui conteúdo de mensagem configurado' });
      }

      const leadCount = await this.prisma.campaignLead.count({
        where: {
          campaignId: id,
          status: 'PENDING',
        },
      });

      if (leadCount === 0) {
        return reply.code(400).send({ error: 'Campanha não possui leads pendentes para envio' });
      }

      // Atualizar status para RUNNING
      const updatedCampaign = await this.campaignService.updateCampaignStatus(
        id,
        authRequest.user.organizationId,
        'RUNNING' as any
      );

      // Disparar campanha em background (não aguardar)
      this.campaignDispatcher.dispatchCampaign(id, authRequest.user.organizationId).catch((error) => {
        console.error(`Erro ao disparar campanha ${id}:`, error);
        // Atualizar status para erro se necessário
        this.campaignService.updateCampaignStatus(
          id,
          authRequest.user.organizationId,
          'PAUSED' as any
        ).catch(console.error);
      });

      return reply.send({ campaign: updatedCampaign });
    } catch (error: any) {
      if (error.message === 'Campanha não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao iniciar campanha' });
    }
  }

  /**
   * POST /api/campaigns/:id/pause
   * Pausar campanha
   */
  async pauseCampaign(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;

      const campaign = await this.campaignService.updateCampaignStatus(
        id,
        authRequest.user.organizationId,
        'PAUSED' as any
      );

      return reply.send({ campaign });
    } catch (error: any) {
      if (error.message === 'Campanha não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao pausar campanha' });
    }
  }

  /**
   * PUT /api/campaigns/:id
   * Atualizar campanha
   */
  async updateCampaign(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        name?: string;
        description?: string;
        flowId?: string;
        instanceId?: string;
        scheduledAt?: string;
        messageContent?: any;
      };
    }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;
      const { name, description, flowId, instanceId, scheduledAt, messageContent } = request.body;

      const campaign = await this.campaignService.updateCampaign(
        id,
        authRequest.user.organizationId,
        {
          name,
          description,
          flowId,
          instanceId,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          messageContent,
        }
      );

      return reply.send({ campaign });
    } catch (error: any) {
      if (
        error.message === 'Campanha não encontrada' ||
        error.message === 'Flow não encontrado ou não pertence à organização' ||
        error.message === 'Instância não encontrada ou não pertence à organização'
      ) {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao atualizar campanha' });
    }
  }

  /**
   * DELETE /api/campaigns/:id
   * Deletar campanha
   */
  async deleteCampaign(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;

      await this.campaignService.deleteCampaign(id, authRequest.user.organizationId);

      return reply.send({ message: 'Campanha deletada com sucesso' });
    } catch (error: any) {
      if (error.message === 'Campanha não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      if (error.message === 'Não é possível deletar uma campanha em execução') {
        return reply.code(400).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao deletar campanha' });
    }
  }

  /**
   * GET /api/campaigns/:id/leads
   * Listar leads da campanha
   */
  async listCampaignLeads(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;
      const leads = await this.campaignService.listCampaignLeads(
        id,
        authRequest.user.organizationId
      );

      return reply.send({ leads });
    } catch (error: any) {
      if (error.message === 'Campanha não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao listar leads' });
    }
  }

  /**
   * POST /api/campaigns/:id/leads
   * Adicionar lead à campanha
   */
  async addCampaignLead(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { contactId: string };
    }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;
      const { contactId } = request.body;

      if (!contactId) {
        return reply.code(400).send({ error: 'contactId é obrigatório' });
      }

      const lead = await this.campaignService.addCampaignLead(
        id,
        authRequest.user.organizationId,
        contactId
      );

      return reply.code(201).send({ lead });
    } catch (error: any) {
      if (
        error.message === 'Campanha não encontrada' ||
        error.message === 'Contato não encontrado'
      ) {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao adicionar lead' });
    }
  }

  /**
   * DELETE /api/campaigns/:id/leads/:leadId
   * Remover lead da campanha
   */
  async removeCampaignLead(
    request: FastifyRequest<{ Params: { id: string; leadId: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id, leadId } = request.params;

      await this.campaignService.removeCampaignLead(
        id,
        authRequest.user.organizationId,
        leadId
      );

      return reply.send({ message: 'Lead removido com sucesso' });
    } catch (error: any) {
      if (error.message === 'Lead não encontrado') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao remover lead' });
    }
  }

  /**
   * GET /api/campaigns/:id/stats
   * Estatísticas da campanha
   */
  async getCampaignStats(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;

      const stats = await this.campaignService.getCampaignStats(
        id,
        authRequest.user.organizationId
      );

      return reply.send({ stats });
    } catch (error: any) {
      if (error.message === 'Campanha não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao obter estatísticas' });
    }
  }

  /**
   * POST /api/campaigns/:id/reset-leads-status
   * Resetar status dos leads e estatísticas da campanha
   */
  async resetCampaignLeadsStatus(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;

      await this.campaignService.resetCampaignLeadsAndStats(
        id,
        authRequest.user.organizationId
      );

      return reply.send({
        success: true,
        message: 'Status dos leads e estatísticas da campanha resetados com sucesso',
      });
    } catch (error: any) {
      if (error.message === 'Campanha não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao resetar status dos leads da campanha' });
    }
  }

  /**
   * POST /api/campaigns/:id/reset-flow-executions
   * Resetar execuções de Flow associadas à campanha
   */
  async resetCampaignFlowExecutions(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;

      // Buscar campanha para garantir organização e obter flowId
      const campaign = await this.prisma.campaign.findFirst({
        where: {
          id,
          organizationId: authRequest.user.organizationId,
        },
      });

      if (!campaign) {
        return reply.code(404).send({ error: 'Campanha não encontrada' });
      }

      if (!campaign.flowId) {
        return reply.code(400).send({ error: 'Campanha não possui Flow associado para resetar execuções' });
      }

      // Buscar contatos (leads) desta campanha
      const campaignLeads = await this.prisma.campaignLead.findMany({
        where: {
          campaignId: id,
        },
        select: {
          contactId: true,
        },
      });

      const contactIds = campaignLeads.map((lead) => lead.contactId);

      if (contactIds.length === 0) {
        return reply.send({
          success: true,
          message: 'Nenhum lead encontrado para esta campanha. Nada a resetar.',
        });
      }

      // Buscar TODAS as execuções de flow relacionadas (incluindo PROCESSING e WAITING)
      // Isso permite resetar execuções ativas para que o flow seja reiniciado do início
      const executions = await this.prisma.flowExecution.findMany({
        where: {
          flowId: campaign.flowId,
          contactId: {
            in: contactIds,
          },
          // Resetar TODAS as execuções, não apenas COMPLETED/ABANDONED
          // Isso garante que execuções ativas também sejam resetadas
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (executions.length === 0) {
        return reply.send({
          success: true,
          message: 'Nenhuma execução encontrada para resetar.',
        });
      }

      const activeExecutions = executions.filter(e => e.status === 'PROCESSING' || e.status === 'WAITING');
      const completedExecutions = executions.filter(e => e.status === 'COMPLETED' || e.status === 'ABANDONED');
      
      console.log(`[CampaignController] Resetando ${executions.length} execuções:`);
      console.log(`  - Ativas (PROCESSING/WAITING): ${activeExecutions.length}`);
      console.log(`  - Completadas (COMPLETED/ABANDONED): ${completedExecutions.length}`);

      // Importar FlowEngineService e dependências
      const { FlowEngineService } = await import('../services/flow-engine.service');
      const { MessageQueueService } = await import('../services/message-queue.service');
      const { AIService } = await import('../services/ai.service');
      const { HttpService } = await import('../services/http.service');

      const messageQueue = new MessageQueueService();
      const aiService = new AIService(this.prisma);
      const httpService = new HttpService();
      const flowEngine = new FlowEngineService(this.prisma, messageQueue, aiService, httpService);

      // Resetar execuções em série (para evitar sobrecarga)
      for (const execution of executions) {
        try {
          await flowEngine.resetExecution(execution.id);
        } catch (error: any) {
          console.error(`[CampaignController] Erro ao resetar execução ${execution.id}:`, error.message);
        }
      }

      return reply.send({
        success: true,
        message: `Reset de ${executions.length} execução(ões) de Flow associado(s) à campanha concluído. Os flows serão executados quando os contatos interagirem novamente.`,
      });
    } catch (error: any) {
      console.error('[CampaignController] Erro ao resetar execuções de Flow da campanha:', error);
      return reply.code(500).send({ error: 'Erro ao resetar execuções de Flow da campanha' });
    }
  }
}

