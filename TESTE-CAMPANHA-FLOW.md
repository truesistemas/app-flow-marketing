# Teste de Diagnóstico: Disparo de Flows em Campanhas

Este script de teste simula a interação de contatos da "Campanha 001" e verifica qual flow está sendo disparado, ajudando a isolar o problema de disparo incorreto.

## Como Executar

```bash
# Na raiz do projeto
npx tsx test-campaign-flow-debug.ts
```

Ou adicione ao package.json:

```bash
npm run test:campaign-flow
```

## O que o teste faz

O script testa 3 cenários diferentes:

### Cenário 1: Contato SEM execução ativa
- Simula um contato respondendo pela primeira vez
- Verifica se o flow da campanha seria iniciado corretamente
- Mostra se há campanhas ativas e qual flow deveria ser disparado

### Cenário 2: Contato COM execução ativa de flow GENÉRICO
- Simula um contato que tem uma execução ativa do "flow" genérico
- Verifica se o sistema continuaria o flow genérico (PROBLEMA) ou iniciaria o flow da campanha
- Identifica se há conflito entre execução genérica e campanha ativa

### Cenário 3: Contato COM execução ativa do flow da CAMPANHA
- Simula um contato que já está no flow da campanha
- Verifica se a execução seria continuada corretamente

## Configuração

Antes de executar, ajuste no arquivo `test-campaign-flow-debug.ts`:

1. **testOrganizationId**: ID da sua organização
2. **testPhone**: Telefone do contato de teste (ou deixe usar um lead existente)
3. **testMessage**: Mensagem que deve disparar o flow (ex: "oi")

## Interpretação dos Resultados

### ✅ Resultado Esperado
- Campanha ativa encontrada com flow correto
- Trigger corresponde à mensagem
- Flow da campanha seria iniciado

### ❌ Problema Detectado
- Execução ativa de flow genérico encontrada
- Sistema continuaria flow genérico ao invés do flow da campanha
- Campanha ativa mas flow não seria iniciado

## Exemplo de Saída

```
🧪 ========================================
🧪 TESTE DE DIAGNÓSTICO: Disparo de Flows em Campanhas
🧪 ========================================

✅ Campanha encontrada: Campanha 001
   - ID: 5762a857-f5ab-4dcc-9c81-24f3d6069927
   - Status: RUNNING
   - Flow ID: flow1-id
   - Flow Nome: flow1
   - Total de leads: 5

📊 Flows ativos na organização: 2
   🎯 - flow1 (flow1-id) <-- Flow da Campanha
      - flow (flow-id)

📋 CENÁRIO 1: Contato SEM execução ativa
   🎯 Campanhas ativas encontradas: 1
      - Campanha 001 (Flow: flow1)
   🔄 Execuções ativas encontradas: 0
   
   🔍 ANÁLISE DO FLUXO DE DECISÃO:
   ✅ Campanha ativa encontrada com flow: flow1
   ✅ Flow esperado: flow1 (flow1-id)
   📝 Trigger do flow: ANY_RESPONSE - Keyword: ""
   📝 Mensagem de teste: "oi"
   ✅ Trigger CORRESPONDE
   ✅ RESULTADO ESPERADO: Flow "flow1" seria iniciado
```

## Próximos Passos

Após executar o teste:

1. **Analise os resultados** para identificar onde está o problema
2. **Verifique os logs** do sistema durante uma interação real
3. **Compare** o comportamento esperado vs. o comportamento real
4. **Aplique correções** baseadas nos resultados do teste


