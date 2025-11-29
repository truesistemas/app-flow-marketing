/**
 * Script de teste para diagnosticar o problema de disparo de flows em campanhas
 * 
 * Este script simula a interação de contatos da "Campanha 001" e verifica
 * qual flow está sendo disparado, ajudando a isolar o problema.
 * 
 * Execute: npx ts-node test-campaign-flow-debug.ts
 */

import { PrismaClient, FlowStatus, CampaignStatus, LeadStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface TestScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  test: () => Promise<{
    expectedFlow: string;
    actualFlow: string | null;
    executionFound: boolean;
    executionFlowId: string | null;
    campaignFound: boolean;
    campaignFlowId: string | null;
  }>;
  cleanup: () => Promise<void>;
}

async function testCampaignFlowDisparo() {
  console.log('🧪 ========================================');
  console.log('🧪 TESTE DE DIAGNÓSTICO: Disparo de Flows em Campanhas');
  console.log('🧪 ========================================\n');

  // ============================================
  // CONFIGURAÇÃO DO TESTE
  // ============================================
  // Ajuste estes valores conforme necessário:
  const testPhone = '5511999999999'; // Telefone do contato de teste
  const testMessage = 'oi'; // Mensagem que deve disparar o flow
  const testOrganizationId = '538ea959-5702-4a43-b992-48ca6cc4de6d'; // ID da organização
  const campaignName = 'Campanha 001'; // Nome da campanha a testar
  
  console.log('⚙️  Configuração do teste:');
  console.log(`   - Organização: ${testOrganizationId}`);
  console.log(`   - Campanha: ${campaignName}`);
  console.log(`   - Telefone: ${testPhone}`);
  console.log(`   - Mensagem: "${testMessage}"\n`);

  // Buscar campanha
  const campaign = await prisma.campaign.findFirst({
    where: {
      name: { contains: campaignName, mode: 'insensitive' },
      organizationId: testOrganizationId,
    },
    include: {
      flow: true,
      leads: {
        include: {
          contact: true,
        },
      },
    },
  });

  if (!campaign) {
    console.error(`❌ Campanha "${campaignName}" não encontrada!`);
    console.log('💡 Verifique se a campanha existe e ajuste os parâmetros de teste se necessário.');
    console.log('💡 Você pode listar todas as campanhas com:');
    console.log('   SELECT id, name, status, "flowId" FROM campaigns WHERE "organizationId" = \'...\';\n');
    return;
  }

  console.log(`✅ Campanha encontrada: ${campaign.name}`);
  console.log(`   - ID: ${campaign.id}`);
  console.log(`   - Status: ${campaign.status}`);
  console.log(`   - Flow ID: ${campaign.flowId || 'NENHUM'}`);
  console.log(`   - Flow Nome: ${campaign.flow?.name || 'NENHUM'}`);
  console.log(`   - Total de leads: ${campaign.leads.length}\n`);

  if (!campaign.flowId || !campaign.flow) {
    console.error('❌ Campanha não possui flow anexado!');
    return;
  }

  const campaignFlowId = campaign.flowId;
  const campaignFlowName = campaign.flow.name;

  // Buscar todos os flows ativos da organização
  const allFlows = await prisma.flow.findMany({
    where: {
      organizationId: testOrganizationId,
      isActive: true,
    },
  });

  console.log(`📊 Flows ativos na organização: ${allFlows.length}`);
  allFlows.forEach(flow => {
    const isCampaignFlow = flow.id === campaignFlowId;
    console.log(`   ${isCampaignFlow ? '🎯' : '  '} - ${flow.name} (${flow.id}) ${isCampaignFlow ? '<-- Flow da Campanha' : ''}`);
  });
  console.log('');

  // Buscar contato de teste (ou usar primeiro lead da campanha)
  let testContact = campaign.leads[0]?.contact;
  
  if (!testContact) {
    // Criar contato de teste
    testContact = await prisma.contact.create({
      data: {
        phone: testPhone,
        name: 'Contato Teste',
        organizationId: testOrganizationId,
      },
    });

    // Adicionar à campanha
    await prisma.campaignLead.create({
      data: {
        campaignId: campaign.id,
        contactId: testContact.id,
        status: LeadStatus.SENT,
      },
    });

    console.log(`✅ Contato de teste criado: ${testContact.phone}`);
  } else {
    console.log(`✅ Usando contato existente: ${testContact.phone} (${testContact.name})`);
  }
  console.log('');

  // ============================================
  // CENÁRIO 1: Sem execução ativa
  // ============================================
  console.log('📋 CENÁRIO 1: Contato SEM execução ativa');
  console.log('   Simulando: Contato responde pela primeira vez\n');

  // Limpar execuções ativas do contato
  await prisma.flowExecution.updateMany({
    where: {
      contactId: testContact.id,
      status: { in: [FlowStatus.PROCESSING, FlowStatus.WAITING] },
    },
    data: {
      status: FlowStatus.ABANDONED,
      completedAt: new Date(),
    },
  });

  // Verificar campanhas ativas
  const activeCampaigns = await prisma.campaign.findMany({
    where: {
      organizationId: testOrganizationId,
      status: CampaignStatus.RUNNING,
      leads: {
        some: {
          contactId: testContact.id,
          status: { in: [LeadStatus.SENT, LeadStatus.DELIVERED, LeadStatus.READ, LeadStatus.REPLIED] },
        },
      },
    },
    include: {
      flow: true,
    },
  });

  console.log(`   🎯 Campanhas ativas encontradas: ${activeCampaigns.length}`);
  activeCampaigns.forEach(c => {
    console.log(`      - ${c.name} (Flow: ${c.flow?.name || 'NENHUM'})`);
  });

  // Verificar execuções ativas
  const activeExecutions = await prisma.flowExecution.findMany({
    where: {
      contactId: testContact.id,
      status: { in: [FlowStatus.PROCESSING, FlowStatus.WAITING] },
    },
    include: {
      flow: true,
    },
  });

  console.log(`   🔄 Execuções ativas encontradas: ${activeExecutions.length}`);
  activeExecutions.forEach(e => {
    console.log(`      - ${e.flow.name} (${e.id}) - Status: ${e.status}`);
  });

  // Verificar qual flow seria iniciado
  console.log('\n   🔍 ANÁLISE DO FLUXO DE DECISÃO:');
  console.log('   ──────────────────────────────────────────');

  if (activeCampaigns.length > 0) {
    const campaignFlow = activeCampaigns.find(c => c.flowId === campaignFlowId);
    if (campaignFlow && campaignFlow.flow) {
      console.log(`   ✅ Campanha ativa encontrada com flow: ${campaignFlow.flow.name}`);
      console.log(`   ✅ Flow esperado: ${campaignFlowName} (${campaignFlowId})`);
      
      // Verificar trigger do flow da campanha
      const flowNodes = campaignFlow.flow.nodes as any[];
      const startNode = flowNodes?.find((n: any) => n.type === 'START');
      
      if (startNode) {
        const triggerType = startNode.config?.triggerType || 'NONE';
        const keyword = startNode.config?.keyword || '';
        console.log(`   📝 Trigger do flow: ${triggerType} - Keyword: "${keyword}"`);
        console.log(`   📝 Mensagem de teste: "${testMessage}"`);
        
        // Simular verificação de trigger
        const messageLower = testMessage.trim().toLowerCase();
        const keywordLower = keyword?.toLowerCase() || '';
        let triggerMatches = false;
        
        switch (triggerType) {
          case 'KEYWORD_EXACT':
            triggerMatches = messageLower === keywordLower;
            break;
          case 'KEYWORD_CONTAINS':
            triggerMatches = messageLower.includes(keywordLower);
            break;
          case 'KEYWORD_STARTS_WITH':
            triggerMatches = messageLower.startsWith(keywordLower);
            break;
          case 'ANY_RESPONSE':
            triggerMatches = testMessage.trim().length > 0;
            break;
        }
        
        console.log(`   ${triggerMatches ? '✅' : '❌'} Trigger ${triggerMatches ? 'CORRESPONDE' : 'NÃO CORRESPONDE'}`);
        
        if (triggerMatches) {
          console.log(`   ✅ RESULTADO ESPERADO: Flow "${campaignFlowName}" seria iniciado`);
        } else {
          console.log(`   ⚠️ RESULTADO: Trigger não correspondeu, flow NÃO seria iniciado`);
        }
      }
    }
  } else {
    console.log(`   ❌ Nenhuma campanha ativa encontrada!`);
  }

  // Verificar se há execuções ativas de outros flows
  if (activeExecutions.length > 0) {
    const nonCampaignExecutions = activeExecutions.filter(
      e => e.flowId !== campaignFlowId
    );
    
    if (nonCampaignExecutions.length > 0) {
      console.log(`\n   ⚠️ PROBLEMA DETECTADO: Execuções ativas de outros flows:`);
      nonCampaignExecutions.forEach(e => {
        console.log(`      - ${e.flow.name} (${e.flow.id}) - Status: ${e.status}`);
        console.log(`        ⚠️ Este flow seria continuado ao invés do flow da campanha!`);
      });
    }
  }

  console.log('\n');

  // ============================================
  // CENÁRIO 2: Com execução ativa de flow genérico
  // ============================================
  console.log('📋 CENÁRIO 2: Contato COM execução ativa de flow GENÉRICO');
  console.log('   Simulando: Contato tem execução ativa do "flow" genérico\n');

  // Buscar um flow genérico (que não seja o da campanha)
  const genericFlow = allFlows.find(f => f.id !== campaignFlowId);
  
  if (genericFlow) {
    // Criar execução ativa do flow genérico
    const genericExecution = await prisma.flowExecution.create({
      data: {
        contactId: testContact.id,
        flowId: genericFlow.id,
        status: FlowStatus.WAITING,
        currentNodeId: 'test-node',
        contextData: {
          variables: {},
          userResponses: [],
          executedNodes: [],
        },
      },
      include: {
        flow: true,
      },
    });

    console.log(`   ✅ Execução ativa criada: ${genericExecution.flow.name} (${genericExecution.id})`);

    // Verificar o que aconteceria
    console.log('\n   🔍 ANÁLISE DO FLUXO DE DECISÃO:');
    console.log('   ──────────────────────────────────────────');

    const activeExecutionsNow = await prisma.flowExecution.findMany({
      where: {
        contactId: testContact.id,
        status: { in: [FlowStatus.PROCESSING, FlowStatus.WAITING] },
      },
      include: {
        flow: true,
      },
    });

    console.log(`   🔄 Execuções ativas: ${activeExecutionsNow.length}`);
    activeExecutionsNow.forEach(e => {
      const isCampaignFlow = e.flowId === campaignFlowId;
      console.log(`      ${isCampaignFlow ? '🎯' : '⚠️'} - ${e.flow.name} (${e.flow.id}) - Status: ${e.status}`);
      if (!isCampaignFlow) {
        console.log(`         ⚠️ PROBLEMA: Esta execução genérica seria continuada!`);
      }
    });

    // Verificar se há campanha ativa
    const activeCampaignsNow = await prisma.campaign.findMany({
      where: {
        organizationId: testOrganizationId,
        status: CampaignStatus.RUNNING,
        leads: {
          some: {
            contactId: testContact.id,
            status: { in: [LeadStatus.SENT, LeadStatus.DELIVERED, LeadStatus.READ, LeadStatus.REPLIED] },
          },
        },
      },
      include: {
        flow: true,
      },
    });

    if (activeCampaignsNow.length > 0) {
      const campaignFlow = activeCampaignsNow.find(c => c.flowId === campaignFlowId);
      if (campaignFlow) {
        console.log(`\n   🎯 Campanha ativa encontrada: ${campaignFlow.name}`);
        console.log(`   🎯 Flow da campanha: ${campaignFlow.flow?.name} (${campaignFlow.flowId})`);
        
        // Verificar se execução ativa pertence à campanha
        const executionBelongsToCampaign = activeExecutionsNow.some(
          e => e.flowId === campaignFlowId
        );
        
        if (!executionBelongsToCampaign) {
          console.log(`\n   ❌ PROBLEMA CRÍTICO DETECTADO:`);
          console.log(`      - Há campanha ativa com flow: ${campaignFlow.flow?.name}`);
          console.log(`      - Mas execução ativa é de outro flow: ${activeExecutionsNow[0].flow.name}`);
          console.log(`      - O sistema continuaria o flow genérico ao invés do flow da campanha!`);
        } else {
          console.log(`\n   ✅ Execução ativa pertence ao flow da campanha`);
        }
      }
    }

    // Limpar execução de teste
    await prisma.flowExecution.delete({
      where: { id: genericExecution.id },
    });
    console.log(`\n   🧹 Execução de teste removida\n`);
  } else {
    console.log(`   ⚠️ Nenhum flow genérico encontrado para teste\n`);
  }

  // ============================================
  // CENÁRIO 3: Com execução ativa do flow da campanha
  // ============================================
  console.log('📋 CENÁRIO 3: Contato COM execução ativa do flow da CAMPANHA');
  console.log('   Simulando: Contato já está no flow da campanha\n');

  // Criar execução ativa do flow da campanha
  const campaignExecution = await prisma.flowExecution.create({
    data: {
      contactId: testContact.id,
      flowId: campaignFlowId,
      status: FlowStatus.WAITING,
      currentNodeId: 'test-node',
      contextData: {
        variables: {},
        userResponses: [],
        executedNodes: [],
        campaignId: campaign.id,
      },
    },
    include: {
      flow: true,
    },
  });

  console.log(`   ✅ Execução ativa criada: ${campaignExecution.flow.name} (${campaignExecution.id})`);

  // Verificar o que aconteceria
  console.log('\n   🔍 ANÁLISE DO FLUXO DE DECISÃO:');
  console.log('   ──────────────────────────────────────────');

  const activeExecutionsCampaign = await prisma.flowExecution.findMany({
    where: {
      contactId: testContact.id,
      status: { in: [FlowStatus.PROCESSING, FlowStatus.WAITING] },
    },
    include: {
      flow: true,
    },
  });

  console.log(`   🔄 Execuções ativas: ${activeExecutionsCampaign.length}`);
  activeExecutionsCampaign.forEach(e => {
    const isCampaignFlow = e.flowId === campaignFlowId;
    console.log(`      ${isCampaignFlow ? '✅' : '⚠️'} - ${e.flow.name} (${e.flow.id}) - Status: ${e.status}`);
    if (isCampaignFlow) {
      console.log(`         ✅ Esta execução seria continuada corretamente`);
    }
  });

  // Limpar execução de teste
  await prisma.flowExecution.delete({
    where: { id: campaignExecution.id },
  });
  console.log(`\n   🧹 Execução de teste removida\n`);

  // ============================================
  // RESUMO E RECOMENDAÇÕES
  // ============================================
  console.log('📊 ========================================');
  console.log('📊 RESUMO DO DIAGNÓSTICO');
  console.log('📊 ========================================\n');

  console.log(`Campanha: ${campaign.name}`);
  console.log(`Flow da campanha: ${campaignFlowName} (${campaignFlowId})`);
  console.log(`Contato de teste: ${testContact.phone}\n`);

  // Verificar estado atual
  const currentActiveExecutions = await prisma.flowExecution.findMany({
    where: {
      contactId: testContact.id,
      status: { in: [FlowStatus.PROCESSING, FlowStatus.WAITING] },
    },
    include: {
      flow: true,
    },
  });

  const currentActiveCampaigns = await prisma.campaign.findMany({
    where: {
      organizationId: testOrganizationId,
      status: CampaignStatus.RUNNING,
      leads: {
        some: {
          contactId: testContact.id,
          status: { in: [LeadStatus.SENT, LeadStatus.DELIVERED, LeadStatus.READ, LeadStatus.REPLIED] },
        },
      },
    },
    include: {
      flow: true,
    },
  });

  console.log(`Estado atual:`);
  console.log(`  - Campanhas ativas: ${currentActiveCampaigns.length}`);
  console.log(`  - Execuções ativas: ${currentActiveExecutions.length}`);

  if (currentActiveExecutions.length > 0) {
    currentActiveExecutions.forEach(e => {
      const belongsToCampaign = currentActiveCampaigns.some(
        c => c.flowId === e.flowId
      );
      console.log(`    ${belongsToCampaign ? '✅' : '❌'} ${e.flow.name} (${e.flow.id})`);
    });
  }

  console.log('\n✅ Teste concluído!');
}

// Executar teste
testCampaignFlowDisparo()
  .catch((error) => {
    console.error('❌ Erro ao executar teste:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

