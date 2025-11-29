import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../services/auth.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class AuthController {
  private authService: AuthService;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.authService = new AuthService(prisma);
  }

  /**
   * POST /api/auth/register
   * Cadastro de usuário e organização
   */
  async register(
    request: FastifyRequest<{
      Body: {
        email: string;
        password: string;
        name: string;
        organizationName: string;
      };
    }>,
    reply: FastifyReply
  ) {
    try {
      const { email, password, name, organizationName } = request.body;

      // Validações básicas
      if (!email || !password || !name || !organizationName) {
        return reply.code(400).send({
          error: 'Todos os campos são obrigatórios',
        });
      }

      if (password.length < 6) {
        return reply.code(400).send({
          error: 'A senha deve ter pelo menos 6 caracteres',
        });
      }

      const result = await this.authService.register({
        email,
        password,
        name,
        organizationName,
      });

      // Gerar token JWT
      const token = await request.server.jwt.sign({
        userId: result.user.id,
        organizationId: result.organization.id,
      });

      return reply.code(201).send({
        user: result.user,
        organization: result.organization,
        token,
      });
    } catch (error: any) {
      if (error.message === 'Email já cadastrado' || error.message === 'Nome da organização já está em uso') {
        return reply.code(409).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao criar conta' });
    }
  }

  /**
   * POST /api/auth/login
   * Login com email e senha
   */
  async login(
    request: FastifyRequest<{
      Body: {
        email: string;
        password: string;
      };
    }>,
    reply: FastifyReply
  ) {
    try {
      const { email, password } = request.body;

      if (!email || !password) {
        return reply.code(400).send({
          error: 'Email e senha são obrigatórios',
        });
      }

      const user = await this.authService.login(email, password);

      // Gerar token JWT
      const token = await request.server.jwt.sign({
        userId: user.id,
        organizationId: user.organizationId,
      });

      return reply.send({
        user,
        token,
      });
    } catch (error: any) {
      if (error.message === 'Email ou senha inválidos') {
        return reply.code(401).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao fazer login' });
    }
  }

  /**
   * GET /api/auth/me
   * Obter usuário atual
   */
  async me(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const user = await this.authService.getUserById(request.user.id);

      return reply.send({ user });
    } catch (error: any) {
      return reply.code(500).send({ error: 'Erro ao obter usuário' });
    }
  }

  /**
   * POST /api/auth/refresh
   * Refresh token (opcional - pode ser implementado depois)
   */
  async refresh(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      // Gerar novo token
      const token = await request.server.jwt.sign({
        userId: request.user.id,
        organizationId: request.user.organizationId,
      });

      return reply.send({ token });
    } catch (error: any) {
      return reply.code(500).send({ error: 'Erro ao renovar token' });
    }
  }
}

