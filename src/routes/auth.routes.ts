import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

export async function authRoutes(fastify: FastifyInstance) {
  const prisma = new PrismaClient();
  const authController = new AuthController(prisma);

  // Rotas públicas
  fastify.post('/register', async (request, reply) => {
    return authController.register(request, reply);
  });

  fastify.post('/login', async (request, reply) => {
    return authController.login(request, reply);
  });

  // Rotas protegidas
  fastify.get(
    '/me',
    {
      preHandler: [authMiddleware],
    },
    async (request: AuthenticatedRequest, reply) => {
      return authController.me(request, reply);
    }
  );

  fastify.post(
    '/refresh',
    {
      preHandler: [authMiddleware],
    },
    async (request: AuthenticatedRequest, reply) => {
      return authController.refresh(request, reply);
    }
  );
}






