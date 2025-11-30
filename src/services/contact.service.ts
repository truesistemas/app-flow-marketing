import { PrismaClient } from '@prisma/client';

export class ContactService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Listar contatos da organização
   */
  async listContacts(
    organizationId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
    } = {}
  ) {
    const { page = 1, limit = 50, search = '' } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      contacts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obter contato por ID
   */
  async getContact(contactId: string, organizationId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId,
      },
    });

    if (!contact) {
      throw new Error('Contato não encontrado');
    }

    return contact;
  }

  /**
   * Criar ou atualizar contato
   */
  async createOrUpdateContact(
    organizationId: string,
    data: {
      phone: string;
      name?: string;
      customFields?: any;
    }
  ) {
    const normalizedPhone = data.phone.replace(/\D/g, '');

    return this.prisma.contact.upsert({
      where: {
        phone_organizationId: {
          phone: normalizedPhone,
          organizationId,
        },
      },
      create: {
        phone: normalizedPhone,
        name: data.name || undefined,
        organizationId,
        customFields: data.customFields || {},
      },
      update: {
        name: data.name || undefined,
        customFields: data.customFields || {},
      },
    });
  }

  /**
   * Atualizar contato
   */
  async updateContact(
    contactId: string,
    organizationId: string,
    data: {
      phone?: string;
      name?: string;
      customFields?: any;
    }
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId,
      },
    });

    if (!contact) {
      throw new Error('Contato não encontrado');
    }

    const updateData: any = {};
    if (data.phone !== undefined) {
      updateData.phone = data.phone.replace(/\D/g, '');
    }
    if (data.name !== undefined) updateData.name = data.name;
    if (data.customFields !== undefined) updateData.customFields = data.customFields;

    return this.prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    });
  }
}






