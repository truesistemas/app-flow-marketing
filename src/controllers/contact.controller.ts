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
   * GET /api/contacts
   * Listar contatos da organização
   */
  async listContacts(
    request: FastifyRequest<{
      Querystring: {
        page?: string;
        limit?: string;
        search?: string;
      };
    }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const page = parseInt(request.query.page || '1');
      const limit = parseInt(request.query.limit || '50');
      const search = request.query.search || '';

      const contacts = await this.contactService.listContacts(
        authRequest.user.organizationId,
        {
          page,
          limit,
          search,
        }
      );

      return reply.send(contacts);
    } catch (error: any) {
      return reply.code(500).send({ error: 'Erro ao listar contatos' });
    }
  }

  /**
   * GET /api/contacts/:id
   * Obter contato por ID
   */
  async getContact(
    request: FastifyRequest<{
      Params: { id: string };
    }>,
    reply: FastifyReply
  ) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params;

      const contact = await this.contactService.getContact(
        id,
        authRequest.user.organizationId
      );

      return reply.send({ contact });
    } catch (error: any) {
      if (error.message === 'Contato não encontrado') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Erro ao obter contato' });
    }
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






