import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

// Aliases conhecidos para telefone
const PHONE_ALIASES = [
  'phone',
  'telefone',
  'celular',
  'mobile',
  'whatsapp',
  'numero',
  'número',
  'tel',
  'fone',
  'contato',
  'telefone1',
  'telefone2',
  'cel',
  'ddd',
  'phone_number',
  'telephone',
];

// Aliases conhecidos para nome
const NAME_ALIASES = [
  'name',
  'nome',
  'fullname',
  'full_name',
  'nome_completo',
  'nomecompleto',
  'cliente',
  'contato',
  'pessoa',
  'usuario',
  'usuário',
  'user',
];

/**
 * Normaliza uma string removendo acentos, espaços e convertendo para lowercase
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/\s+/g, '') // Remove espaços
    .trim();
}

/**
 * Detecta qual coluna corresponde ao telefone
 */
function detectPhoneColumn(headers: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeString(headers[i]);
    if (PHONE_ALIASES.some((alias) => normalized.includes(alias))) {
      return i;
    }
  }
  return null;
}

/**
 * Detecta qual coluna corresponde ao nome
 */
function detectNameColumn(headers: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeString(headers[i]);
    if (NAME_ALIASES.some((alias) => normalized.includes(alias))) {
      return i;
    }
  }
  return null;
}

export interface LeadData {
  phone: string;
  name?: string;
  customFields?: Record<string, any>;
}

export class LeadImportService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Processar arquivo CSV
   */
  async processCSV(fileBuffer: Buffer): Promise<LeadData[]> {
    const text = fileBuffer.toString('utf-8');
    const lines = text.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      throw new Error('Arquivo CSV deve ter pelo menos um cabeçalho e uma linha de dados');
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    const phoneIndex = detectPhoneColumn(headers);
    const nameIndex = detectNameColumn(headers);

    if (phoneIndex === null) {
      throw new Error('Coluna de telefone não encontrada. O arquivo deve conter uma coluna com "phone", "telefone", "celular" ou similar.');
    }

    const leads: LeadData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const phone = this.normalizePhone(values[phoneIndex]);

      if (!phone) continue;

      const lead: LeadData = {
        phone,
      };

      if (nameIndex !== -1 && values[nameIndex]) {
        lead.name = values[nameIndex];
      }

      // Adicionar outros campos como customFields
      const customFields: Record<string, any> = {};
      headers.forEach((header, index) => {
        if (index !== phoneIndex && index !== nameIndex && values[index]) {
          customFields[header] = values[index];
        }
      });

      if (Object.keys(customFields).length > 0) {
        lead.customFields = customFields;
      }

      leads.push(lead);
    }

    return leads;
  }

  /**
   * Processar arquivo Excel
   */
  async processExcel(fileBuffer: Buffer): Promise<LeadData[]> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet) as any[];

    if (data.length === 0) {
      throw new Error('Arquivo Excel está vazio');
    }

    // Encontrar colunas
    const firstRow = data[0];
    const headers = Object.keys(firstRow);
    const phoneKeyIndex = detectPhoneColumn(headers);
    const nameKeyIndex = detectNameColumn(headers);
    
    const phoneKey = phoneKeyIndex !== null ? headers[phoneKeyIndex] : null;
    const nameKey = nameKeyIndex !== null ? headers[nameKeyIndex] : null;

    if (!phoneKey) {
      throw new Error('Coluna de telefone não encontrada. O arquivo deve conter uma coluna com "phone", "telefone", "celular" ou similar.');
    }

    const leads: LeadData[] = [];

    for (const row of data) {
      const phone = this.normalizePhone(String(row[phoneKey] || ''));

      if (!phone) continue;

      const lead: LeadData = {
        phone,
      };

      if (nameKey && row[nameKey]) {
        lead.name = String(row[nameKey]);
      }

      // Adicionar outros campos como customFields
      const customFields: Record<string, any> = {};
      headers.forEach((header) => {
        if (header !== phoneKey && header !== nameKey && row[header]) {
          customFields[header] = row[header];
        }
      });

      if (Object.keys(customFields).length > 0) {
        lead.customFields = customFields;
      }

      leads.push(lead);
    }

    return leads;
  }

  /**
   * Normalizar número de telefone
   */
  private normalizePhone(phone: string): string {
    if (!phone) return '';

    // Remover caracteres não numéricos
    let normalized = phone.replace(/\D/g, '');

    // Se começar com 0, remover
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1);
    }

    // Se não começar com código do país, adicionar 55 (Brasil)
    if (!normalized.startsWith('55') && normalized.length === 10) {
      normalized = '55' + normalized;
    }

    // Validar formato (deve ter pelo menos 10 dígitos)
    if (normalized.length < 10) {
      return '';
    }

    return normalized;
  }

  /**
   * Criar ou atualizar contatos
   */
  async createOrUpdateContacts(
    leads: LeadData[],
    organizationId: string
  ): Promise<string[]> {
    const contactIds: string[] = [];

    for (const lead of leads) {
      const contact = await this.prisma.contact.upsert({
        where: {
          phone_organizationId: {
            phone: lead.phone,
            organizationId,
          },
        },
        create: {
          phone: lead.phone,
          name: lead.name || lead.phone,
          organizationId,
          customFields: lead.customFields || {},
        },
        update: {
          name: lead.name || undefined,
          customFields: {
            ...(lead.customFields || {}),
          },
        },
      });

      contactIds.push(contact.id);
    }

    return contactIds;
  }
}






