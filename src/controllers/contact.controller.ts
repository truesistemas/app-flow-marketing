import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { ContactService } from '../services/contact.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class ContactController {
  private contactService: ContactService;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.contactService = new ContactService(prisma);
  }

  /**
   * POST /api/contacts
   * Criar ou atualizar contato
   */
  async createOrUpdateContact(
    request: FastifyRequest<{
      Body: {
        phone: string;
        name?: string;
        customFields?: any;
      };
    }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { phone, name, customFields } = request.body;

      if (!phone) {
        return reply.code(400).send({ error: 'Telefone é obrigatório' });
      }

      const contact = await this.contactService.createOrUpdateContact(
        authRequest.user.organizationId,
        {
          phone,
          name,
          customFields,
        }
      );

      return reply.code(201).send({ contact });
    } catch (error: any) {
      return reply.code(500).send({ error: 'Erro ao criar/atualizar contato' });
    }
  }

  /**
   * PUT /api/contacts/:id
   * Atualizar contato
   */
  async updateContact(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        phone?: string;
        name?: string;
        customFields?: any;
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
      const { phone, name, customFields } = request.body;

      const contact = await this.contactService.updateContact(
        id,
        authRequest.user.organizationId,
        {
          phone,
          name,
          customFields,
        }
      );

      return reply.send({ contact });
    } catch (error: any) {
      if (error.message === 'Contato não encontrado') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao atualizar contato' });
    }
  }
}






