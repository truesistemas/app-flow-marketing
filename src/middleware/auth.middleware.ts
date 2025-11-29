import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    name: string | null;
    organizationId: string;
  };
}

/**
 * Middleware de autenticação
 * Verifica o token JWT e adiciona o usuário ao request
 */
export async function authMiddleware(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Verificar token no header Authorization
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return reply.code(401).send({ error: 'Token não fornecido' });
    }

    // Verificar token JWT
    const decoded = await request.server.jwt.verify<{ userId: string }>(token);

    // Buscar usuário no banco
    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        organization: true,
      },
    });

    if (!user) {
      return reply.code(401).send({ error: 'Usuário não encontrado' });
    }

    // Adicionar usuário ao request
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
    };

    await prisma.$disconnect();
  } catch (error: any) {
    if (error.message === 'Token não fornecido') {
      return reply.code(401).send({ error: 'Token não fornecido' });
    }
    return reply.code(401).send({ error: 'Token inválido' });
  }
}

