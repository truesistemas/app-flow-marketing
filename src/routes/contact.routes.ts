import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { ContactController } from '../controllers/contact.controller';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

export async function contactRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma || new PrismaClient();
  const contactController = new ContactController(prisma);

  // Todas as rotas requerem autenticação
  fastify.addHook('preHandler', authMiddleware);

  fastify.post('/', async (request: AuthenticatedRequest, reply) => {
    return contactController.createOrUpdateContact(request, reply);
  });

  fastify.put('/:id', async (request: AuthenticatedRequest, reply) => {
    return contactController.updateContact(request, reply);
  });
}






