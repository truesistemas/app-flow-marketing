import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient, InstanceStatus } from '@prisma/client';
import { EvolutionInstanceService } from '../services/evolution-instance.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class EvolutionInstanceController {
  private instanceService: EvolutionInstanceService;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.instanceService = new EvolutionInstanceService(prisma);
  }

  /**
   * GET /api/evolution-instances
   * Listar instâncias da organização
   */
  async listInstances(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { status } = request.query as { status?: string };

      let instanceStatus: InstanceStatus | undefined;
      if (status) {
        const validStatuses: InstanceStatus[] = ['ACTIVE', 'INACTIVE', 'ERROR'];
        if (validStatuses.includes(status as InstanceStatus)) {
          instanceStatus = status as InstanceStatus;
        }
      }

      const instances = await this.instanceService.listInstances(request.user.organizationId, {
        status: instanceStatus,
      });

      return reply.send(instances);
    } catch (error: any) {
      console.error('Erro ao listar instâncias:', error);
      return reply.code(500).send({ error: error.message || 'Erro ao listar instâncias' });
    }
  }

  /**
   * POST /api/evolution-instances
   * Criar nova instância
   */
  async createInstance(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { name, instanceName, apiUrl, apiKey, integrationType, websocketGlobalMode } = request.body as {
        name?: string;
        instanceName?: string;
        apiUrl?: string;
        apiKey?: string;
        integrationType?: 'WEBHOOK' | 'WEBSOCKET';
        websocketGlobalMode?: boolean;
      };

      if (!name || !instanceName || !apiUrl) {
        return reply.code(400).send({
          error: 'Campos obrigatórios: name, instanceName, apiUrl',
        });
      }

      const instance = await this.instanceService.createInstance(request.user.organizationId, {
        name,
        instanceName,
        apiUrl,
        apiKey,
        integrationType,
        websocketGlobalMode,
      });

      return reply.code(201).send(instance);
    } catch (error: any) {
      console.error('Erro ao criar instância:', error);
      return reply.code(400).send({ error: error.message || 'Erro ao criar instância' });
    }
  }

  /**
   * GET /api/evolution-instances/:id
   * Obter detalhes de uma instância
   */
  async getInstance(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };

      const instance = await this.instanceService.getInstance(id, request.user.organizationId);

      return reply.send(instance);
    } catch (error: any) {
      console.error('Erro ao obter instância:', error);
      if (error.message === 'Instância não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: error.message || 'Erro ao obter instância' });
    }
  }

  /**
   * PUT /api/evolution-instances/:id
   * Atualizar instância
   */
  async updateInstance(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };
      const { name, instanceName, apiUrl, apiKey, integrationType, websocketGlobalMode } = request.body as {
        name?: string;
        instanceName?: string;
        apiUrl?: string;
        apiKey?: string;
        integrationType?: 'WEBHOOK' | 'WEBSOCKET';
        websocketGlobalMode?: boolean;
      };

      const instance = await this.instanceService.updateInstance(
        id,
        request.user.organizationId,
        {
          name,
          instanceName,
          apiUrl,
          apiKey,
          integrationType,
          websocketGlobalMode,
        }
      );

      return reply.send(instance);
    } catch (error: any) {
      console.error('Erro ao atualizar instância:', error);
      if (error.message === 'Instância não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(400).send({ error: error.message || 'Erro ao atualizar instância' });
    }
  }

  /**
   * DELETE /api/evolution-instances/:id
   * Deletar instância
   */
  async deleteInstance(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };

      await this.instanceService.deleteInstance(id, request.user.organizationId);

      return reply.code(204).send();
    } catch (error: any) {
      console.error('Erro ao deletar instância:', error);
      if (error.message === 'Instância não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(400).send({ error: error.message || 'Erro ao deletar instância' });
    }
  }

  /**
   * POST /api/evolution-instances/:id/test
   * Testar conexão com a Evolution API
   */
  async testConnection(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };

      const testResult = await this.instanceService.testConnection(
        id,
        request.user.organizationId
      );

      return reply.send(testResult);
    } catch (error: any) {
      console.error('Erro ao testar conexão:', error);
      if (error.message === 'Instância não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: error.message || 'Erro ao testar conexão' });
    }
  }

  /**
   * POST /api/evolution-instances/:id/test/text
   * Testar envio de mensagem de texto
   */
  async testSendTextMessage(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };
      const { phone } = request.body as { phone?: string };

      if (!phone) {
        return reply.code(400).send({ error: 'Número de telefone é obrigatório' });
      }

      const testResult = await this.instanceService.testSendTextMessage(
        id,
        request.user.organizationId,
        phone
      );

      return reply.send(testResult);
    } catch (error: any) {
      console.error('Erro ao testar envio de texto:', error);
      if (error.message === 'Instância não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: error.message || 'Erro ao testar envio de texto' });
    }
  }

  /**
   * POST /api/evolution-instances/:id/test/media
   * Testar envio de mídia (imagem)
   */
  async testSendMedia(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };
      const { phone, mediaUrl, mediaBase64, mimeType } = request.body as {
        phone?: string;
        mediaUrl?: string;
        mediaBase64?: string;
        mimeType?: string;
      };

      if (!phone) {
        return reply.code(400).send({ error: 'Número de telefone é obrigatório' });
      }

      const testResult = await this.instanceService.testSendMedia(
        id,
        request.user.organizationId,
        phone,
        mediaUrl || '',
        mediaBase64,
        mimeType
      );

      return reply.send(testResult);
    } catch (error: any) {
      console.error('Erro ao testar envio de mídia:', error);
      if (error.message === 'Instância não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: error.message || 'Erro ao testar envio de mídia' });
    }
  }

  /**
   * POST /api/evolution-instances/:id/test/audio
   * Testar envio de áudio
   */
  async testSendAudio(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };
      const { phone, audioUrl, audioBase64, mimeType } = request.body as {
        phone?: string;
        audioUrl?: string;
        audioBase64?: string;
        mimeType?: string;
      };

      if (!phone) {
        return reply.code(400).send({ error: 'Número de telefone é obrigatório' });
      }

      const testResult = await this.instanceService.testSendAudio(
        id,
        request.user.organizationId,
        phone,
        audioUrl || '',
        audioBase64,
        mimeType
      );

      return reply.send(testResult);
    } catch (error: any) {
      console.error('Erro ao testar envio de áudio:', error);
      if (error.message === 'Instância não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: error.message || 'Erro ao testar envio de áudio' });
    }
  }

  /**
   * POST /api/evolution-instances/:id/test/webhook
   * Testar configuração de webhook
   */
  async testWebhook(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };

      const testResult = await this.instanceService.testWebhook(
        id,
        request.user.organizationId
      );

      return reply.send(testResult);
    } catch (error: any) {
      console.error('Erro ao testar webhook:', error);
      if (error.message === 'Instância não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: error.message || 'Erro ao testar webhook' });
    }
  }

  /**
   * POST /api/evolution-instances/:id/test/websocket
   * Testar conexão WebSocket e escuta de eventos
   */
  async testWebSocket(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };
      const { timeout } = request.body as { timeout?: number };

      const testResult = await this.instanceService.testWebSocket(
        id,
        request.user.organizationId,
        timeout || 30000
      );

      return reply.send(testResult);
    } catch (error: any) {
      console.error('Erro ao testar WebSocket:', error);
      if (error.message === 'Instância não encontrada') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: error.message || 'Erro ao testar WebSocket' });
    }
  }
}




