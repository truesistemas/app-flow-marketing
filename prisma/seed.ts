import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Criar organização de exemplo
  const organization = await prisma.organization.upsert({
    where: { slug: 'exemplo-org' },
    update: {},
    create: {
      name: 'Organização Exemplo',
      slug: 'exemplo-org',
      apiKeyEvolution: process.env.EVOLUTION_API_KEY || 'sua-api-key-aqui',
    },
  });

  console.log('✅ Organização criada:', organization.name);

  // Criar usuário de exemplo
  const user = await prisma.user.upsert({
    where: { email: 'admin@exemplo.com' },
    update: {},
    create: {
      email: 'admin@exemplo.com',
      passwordHash: '$2b$10$exemplo.hash.aqui', // Hash de exemplo (use bcrypt em produção)
      name: 'Admin',
      organizationId: organization.id,
    },
  });

  console.log('✅ Usuário criado:', user.email);

  // Criar flow de exemplo
  const flow = await prisma.flow.create({
    data: {
      name: 'Flow de Boas-vindas',
      description: 'Flow simples de boas-vindas',
      triggerKeyword: 'oi',
      isActive: true,
      organizationId: organization.id,
      nodes: [
        {
          id: 'start-1',
          type: 'START',
          position: { x: 100, y: 100 },
          config: {
            triggerType: 'KEYWORD',
            keyword: 'oi',
          },
        },
        {
          id: 'message-1',
          type: 'MESSAGE',
          position: { x: 300, y: 100 },
          config: {
            text: 'Olá! Bem-vindo ao nosso atendimento. Como posso ajudar?',
            variables: [],
          },
        },
        {
          id: 'action-1',
          type: 'ACTION',
          position: { x: 500, y: 100 },
          config: {
            actionType: 'WAIT_RESPONSE',
            saveResponseAs: 'userMessage',
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'start-1',
          target: 'message-1',
        },
        {
          id: 'edge-2',
          source: 'message-1',
          target: 'action-1',
        },
      ],
    },
  });

  console.log('✅ Flow criado:', flow.name);

  console.log('🎉 Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

