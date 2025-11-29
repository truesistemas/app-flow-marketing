import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import fastifyMultipart from '@fastify/multipart';
import { MediaController } from '../controllers/media.controller';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

export async function mediaRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma || new PrismaClient();
  const mediaController = new MediaController(prisma);

  // Registrar multipart para upload de arquivos
  await fastify.register(fastifyMultipart);

  // Todas as rotas requerem autenticação
  fastify.addHook('preHandler', authMiddleware);

  fastify.post('/upload', async (request: AuthenticatedRequest, reply) => {
    return mediaController.uploadMedia(request, reply);
  });
}






