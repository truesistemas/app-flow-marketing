import { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import { CampaignController } from '../controllers/campaign.controller';
import { MessageQueueService } from '../services/message-queue.service';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

export async function campaignRoutes(fastify: FastifyInstance) {
  // Usar a instância do Prisma do contexto do Fastify se disponível, senão criar nova
  const prisma = (fastify as any).prisma || new PrismaClient();
  const messageQueue = (fastify as any).messageQueue || new MessageQueueService();
  const campaignController = new CampaignController(prisma, messageQueue);

  // Registrar multipart para upload de arquivos
  await fastify.register(fastifyMultipart);

  // Todas as rotas requerem autenticação
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/', async (request: AuthenticatedRequest, reply) => {
    return campaignController.listCampaigns(request, reply);
  });

  fastify.post('/', async (request: AuthenticatedRequest, reply) => {
    return campaignController.createCampaign(request, reply);
  });

  fastify.get('/:id', async (request: AuthenticatedRequest, reply) => {
    return campaignController.getCampaign(request, reply);
  });

  fastify.put('/:id', async (request: AuthenticatedRequest, reply) => {
    return campaignController.updateCampaign(request, reply);
  });

  fastify.delete('/:id', async (request: AuthenticatedRequest, reply) => {
    return campaignController.deleteCampaign(request, reply);
  });

  fastify.post('/:id/import-leads', async (request: AuthenticatedRequest, reply) => {
    return campaignController.importLeads(request, reply);
  });

  fastify.post('/:id/start', async (request: AuthenticatedRequest, reply) => {
    return campaignController.startCampaign(request, reply);
  });

  fastify.post('/:id/pause', async (request: AuthenticatedRequest, reply) => {
    return campaignController.pauseCampaign(request, reply);
  });

  fastify.get('/:id/stats', async (request: AuthenticatedRequest, reply) => {
    return campaignController.getCampaignStats(request, reply);
  });

  fastify.post('/:id/reset-leads-status', async (request: AuthenticatedRequest, reply) => {
    return campaignController.resetCampaignLeadsStatus(request, reply);
  });

  fastify.post('/:id/reset-flow-executions', async (request: AuthenticatedRequest, reply) => {
    return campaignController.resetCampaignFlowExecutions(request, reply);
  });

  fastify.get('/:id/leads', async (request: AuthenticatedRequest, reply) => {
    return campaignController.listCampaignLeads(request, reply);
  });

  fastify.post('/:id/leads', async (request: AuthenticatedRequest, reply) => {
    return campaignController.addCampaignLead(request, reply);
  });

  fastify.delete('/:id/leads/:leadId', async (request: AuthenticatedRequest, reply) => {
    return campaignController.removeCampaignLead(request, reply);
  });
}

