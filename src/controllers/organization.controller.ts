import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AIService } from '../services/ai.service';

export class OrganizationController {
  constructor(
    private prisma: PrismaClient,
    private aiService: AIService
  ) {}

  /**
   * Mascarar chave API (mostra apenas últimos 4 caracteres)
   */
  private maskApiKey(key: string | null | undefined): string | null {
    if (!key || key.length <= 4) {
      return null;
    }
    return `****${key.slice(-4)}`;
  }

  /**
   * Validar formato de chave API
   */
  private validateApiKey(provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC', key: string): boolean {
    if (!key || key.trim().length === 0) {
      return false;
    }

    switch (provider) {
      case 'OPENAI':
        return key.startsWith('sk-');
      case 'GEMINI':
        return key.startsWith('AIza');
      case 'ANTHROPIC':
        return key.startsWith('sk-ant-');
      default:
        return false;
    }
  }

  /**
   * GET /api/organizations/:id/api-keys
   * Obter chaves API (mascaradas)
   */
  async getApiKeys(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;

      // Verificar se o usuário pertence à organização
      if (authRequest.user.organizationId !== id) {
        return reply.code(403).send({ error: 'Acesso negado' });
      }

      const organization = await this.prisma.organization.findUnique({
        where: { id },
        select: {
          openaiApiKey: true,
          geminiApiKey: true,
          anthropicApiKey: true,
        },
      });

      if (!organization) {
        return reply.code(404).send({ error: 'Organização não encontrada' });
      }

      return reply.send({
        openai: this.maskApiKey(organization.openaiApiKey),
        gemini: this.maskApiKey(organization.geminiApiKey),
        anthropic: this.maskApiKey(organization.anthropicApiKey),
      });
    } catch (error: any) {
      console.error('Erro ao obter chaves API:', error);
      return reply.code(500).send({ error: 'Erro ao obter chaves API' });
    }
  }

  /**
   * PUT /api/organizations/:id/api-keys
   * Atualizar chaves API
   */
  async updateApiKeys(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        openai?: string | null;
        gemini?: string | null;
        anthropic?: string | null;
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
      const { openai, gemini, anthropic } = request.body;

      // Verificar se o usuário pertence à organização
      if (authRequest.user.organizationId !== id) {
        return reply.code(403).send({ error: 'Acesso negado' });
      }

      // Validar chaves fornecidas
      const errors: string[] = [];
      if (openai !== undefined && openai !== null && !this.validateApiKey('OPENAI', openai)) {
        errors.push('Chave OpenAI inválida. Deve começar com "sk-"');
      }
      if (gemini !== undefined && gemini !== null && !this.validateApiKey('GEMINI', gemini)) {
        errors.push('Chave Gemini inválida. Deve começar com "AIza"');
      }
      if (anthropic !== undefined && anthropic !== null && !this.validateApiKey('ANTHROPIC', anthropic)) {
        errors.push('Chave Anthropic inválida. Deve começar com "sk-ant-"');
      }

      if (errors.length > 0) {
        return reply.code(400).send({ error: errors.join('; ') });
      }

      // Preparar dados de atualização
      const updateData: any = {};
      if (openai !== undefined) {
        updateData.openaiApiKey = openai || null;
      }
      if (gemini !== undefined) {
        updateData.geminiApiKey = gemini || null;
      }
      if (anthropic !== undefined) {
        updateData.anthropicApiKey = anthropic || null;
      }

      // Atualizar organização
      const organization = await this.prisma.organization.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          openaiApiKey: true,
          geminiApiKey: true,
          anthropicApiKey: true,
        },
      });

      return reply.send({
        message: 'Chaves API atualizadas com sucesso',
        keys: {
          openai: this.maskApiKey(organization.openaiApiKey),
          gemini: this.maskApiKey(organization.geminiApiKey),
          anthropic: this.maskApiKey(organization.anthropicApiKey),
        },
      });
    } catch (error: any) {
      console.error('Erro ao atualizar chaves API:', error);
      return reply.code(500).send({ error: 'Erro ao atualizar chaves API' });
    }
  }

  /**
   * POST /api/organizations/:id/api-keys/test
   * Testar chave API
   */
  async testApiKey(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC';
        apiKey?: string; // Opcional, usa do banco se não fornecido
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
      const { provider, apiKey: providedKey } = request.body;

      // Verificar se o usuário pertence à organização
      if (authRequest.user.organizationId !== id) {
        return reply.code(403).send({ error: 'Acesso negado' });
      }

      // Buscar chave do banco se não fornecida
      let apiKey = providedKey;
      if (!apiKey) {
        const organization = await this.prisma.organization.findUnique({
          where: { id },
          select: {
            openaiApiKey: true,
            geminiApiKey: true,
            anthropicApiKey: true,
          },
        });

        if (!organization) {
          return reply.code(404).send({ error: 'Organização não encontrada' });
        }

        switch (provider) {
          case 'OPENAI':
            apiKey = organization.openaiApiKey || undefined;
            break;
          case 'GEMINI':
            apiKey = organization.geminiApiKey || undefined;
            break;
          case 'ANTHROPIC':
            apiKey = organization.anthropicApiKey || undefined;
            break;
        }
      }

      if (!apiKey) {
        return reply.code(400).send({ error: `Chave ${provider} não configurada` });
      }

      // Validar formato
      if (!this.validateApiKey(provider, apiKey)) {
        return reply.code(400).send({ error: `Formato de chave ${provider} inválido` });
      }

      // Fazer chamada de teste
      try {
        // Se uma chave foi fornecida, criar um AIService temporário com a chave fornecida
        // Caso contrário, usar a chave do banco via organizationId
        let testOrganizationId = id;
        
        if (providedKey) {
          // Se uma chave foi fornecida, atualizar temporariamente no banco para teste
          const updateData: any = {};
          switch (provider) {
            case 'OPENAI':
              updateData.openaiApiKey = providedKey;
              break;
            case 'GEMINI':
              updateData.geminiApiKey = providedKey;
              break;
            case 'ANTHROPIC':
              updateData.anthropicApiKey = providedKey;
              break;
          }
          await this.prisma.organization.update({
            where: { id },
            data: updateData,
          });
        }

        // Fazer chamada de teste usando a chave do banco
        const testResponse = await this.aiService.generateResponse({
          provider,
          organizationId: testOrganizationId, // Passar organizationId para o serviço buscar a chave
          model: provider === 'OPENAI' ? 'gpt-3.5-turbo' : provider === 'GEMINI' ? 'gemini-pro' : 'claude-3-haiku-20240307',
          userPrompt: 'Teste de conexão. Responda apenas com "OK" se recebeu esta mensagem.',
          temperature: 0.7,
          maxTokens: 10,
        });

        return reply.send({
          success: true,
          message: `Chave ${provider} testada com sucesso`,
          response: testResponse.substring(0, 100), // Primeiros 100 caracteres da resposta
        });
      } catch (error: any) {
        console.error(`Erro ao testar chave ${provider}:`, error);
        return reply.code(400).send({
          success: false,
          error: `Erro ao testar chave: ${error.message}`,
        });
      }
    } catch (error: any) {
      console.error('Erro ao testar chave API:', error);
      return reply.code(500).send({ error: 'Erro ao testar chave API' });
    }
  }
}

