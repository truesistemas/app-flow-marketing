/**
 * Utilitário para detectar automaticamente colunas de telefone e nome em arquivos CSV/Excel
 */

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
export function detectPhoneColumn(headers: string[]): number | null {
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
export function detectNameColumn(headers: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeString(headers[i]);
    if (NAME_ALIASES.some((alias) => normalized.includes(alias))) {
      return i;
    }
  }
  return null;
}

/**
 * Detecta automaticamente colunas de telefone e nome
 * Retorna um objeto com os índices ou null se não encontrar
 */
export function detectColumns(headers: string[]): {
  phoneIndex: number | null;
  nameIndex: number | null;
  phoneColumn: string | null;
  nameColumn: string | null;
} {
  const phoneIndex = detectPhoneColumn(headers);
  const nameIndex = detectNameColumn(headers);

  return {
    phoneIndex,
    nameIndex,
    phoneColumn: phoneIndex !== null ? headers[phoneIndex] : null,
    nameColumn: nameIndex !== null ? headers[nameIndex] : null,
  };
}


