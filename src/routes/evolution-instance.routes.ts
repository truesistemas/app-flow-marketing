import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { EvolutionInstanceController } from '../controllers/evolution-instance.controller';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

export async function evolutionInstanceRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma || new PrismaClient();
  const instanceController = new EvolutionInstanceController(prisma);

  // Todas as rotas requerem autenticação
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/', async (request: AuthenticatedRequest, reply) => {
    return instanceController.listInstances(request, reply);
  });

  fastify.post('/', async (request: AuthenticatedRequest, reply) => {
    return instanceController.createInstance(request, reply);
  });

  fastify.get('/:id', async (request: AuthenticatedRequest, reply) => {
    return instanceController.getInstance(request, reply);
  });

  fastify.put('/:id', async (request: AuthenticatedRequest, reply) => {
    return instanceController.updateInstance(request, reply);
  });

  fastify.delete('/:id', async (request: AuthenticatedRequest, reply) => {
    return instanceController.deleteInstance(request, reply);
  });

  fastify.post('/:id/test', async (request: AuthenticatedRequest, reply) => {
    return instanceController.testConnection(request, reply);
  });

  fastify.post('/:id/test/text', async (request: AuthenticatedRequest, reply) => {
    return instanceController.testSendTextMessage(request, reply);
  });

  fastify.post('/:id/test/media', async (request: AuthenticatedRequest, reply) => {
    return instanceController.testSendMedia(request, reply);
  });

  fastify.post('/:id/test/audio', async (request: AuthenticatedRequest, reply) => {
    return instanceController.testSendAudio(request, reply);
  });

  fastify.post('/:id/test/webhook', async (request: AuthenticatedRequest, reply) => {
    return instanceController.testWebhook(request, reply);
  });

  fastify.post('/:id/test/websocket', async (request: AuthenticatedRequest, reply) => {
    return instanceController.testWebSocket(request, reply);
  });
}




