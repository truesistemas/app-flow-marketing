import { PrismaClient } from '@prisma/client';

export class ContactService {
  constructor(private prisma: PrismaClient) {}

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






