import { FastifyInstance, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { OrganizationController } from '../controllers/organization.controller';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { AIService } from '../services/ai.service';

export async function organizationRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma || new PrismaClient();
  const aiService = new AIService(prisma);
  const organizationController = new OrganizationController(prisma, aiService);

  // Todas as rotas requerem autenticação
  fastify.addHook('preHandler', authMiddleware as any);

  /**
   * GET /api/organizations/:id/api-keys
   * Obter chaves API (mascaradas)
   */
  fastify.get(
    '/:id/api-keys',
    async (request: FastifyRequest, reply) => {
      return organizationController.getApiKeys(request as any, reply);
    }
  );

  /**
   * PUT /api/organizations/:id/api-keys
   * Atualizar chaves API
   */
  fastify.put(
    '/:id/api-keys',
    async (request: FastifyRequest, reply) => {
      return organizationController.updateApiKeys(request as any, reply);
    }
  );

  /**
   * POST /api/organizations/:id/api-keys/test
   * Testar chave API
   */
  fastify.post(
    '/:id/api-keys/test',
    async (request: FastifyRequest, reply) => {
      return organizationController.testApiKey(request as any, reply);
    }
  );
}

