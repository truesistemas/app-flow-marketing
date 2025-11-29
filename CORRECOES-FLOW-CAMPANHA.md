# Correções Implementadas: Disparo de Flow Correto em Campanhas

## Problema Identificado

O sistema estava disparando o flow errado para contatos de campanhas. Quando um contato da "Campanha 001" (com "flow1") respondia, o sistema disparava o "flow" genérico ao invés do "flow1" da campanha.

## Causa Raiz

1. **Verificação de execuções ativas sem considerar campanhas**: O método `processIncomingMessage` verificava execuções ativas antes de verificar campanhas, continuando execuções de flows genéricos mesmo quando havia campanha ativa.

2. **"Resetar Flows" incompleto**: A função só resetava execuções `COMPLETED` ou `ABANDONED`, não resetava execuções ativas (`PROCESSING`/`WAITING`).

3. **Falta de prioridade para flows de campanha**: Quando havia execução ativa de flow genérico e campanha ativa, o sistema não cancelava a execução genérica.

## Correções Implementadas

### 1. ✅ `processIncomingMessage` - Verificação de Campanhas Primeiro

**Arquivo**: `src/services/flow-engine.service.ts` (linhas 79-160)

**Mudança**:
- Agora verifica campanhas ativas ANTES de verificar execuções ativas
- Se há campanha ativa:
  - Verifica se execução ativa pertence ao flow da campanha
  - Se sim → continua execução
  - Se não → cancela execução genérica e permite iniciar flow da campanha
- Se não há campanha ativa → funciona normalmente

### 2. ✅ `startFlowFromCampaign` - Cancelamento de Execuções Conflitantes

**Arquivo**: `src/services/flow-engine.service.ts` (linhas 401-580)

**Mudança**:
- Ao iniciar flow de campanha, busca execuções ativas de OUTROS flows
- Cancela automaticamente todas as execuções genéricas (status `ABANDONED`)
- Garante prioridade absoluta para o flow da campanha

### 3. ✅ Webhook Controller - Cancelamento Preventivo

**Arquivo**: `src/controllers/webhook.controller.ts` (linhas 187-210)

**Mudança**:
- Mesmo quando o trigger não corresponde, se há campanha ativa:
  - Cancela execuções ativas de flows genéricos
  - Previne que flows genéricos sejam continuados
- Garante que apenas o flow da campanha seja processado

### 4. ✅ "Resetar Flows" - Reset Completo

**Arquivo**: `src/controllers/campaign.controller.ts` (linhas 625-646)

**Mudança**:
- Agora reseta TODAS as execuções (incluindo `PROCESSING` e `WAITING`)
- Permite reiniciar flows do início na próxima interação
- Logs mostram quantas execuções ativas e completadas foram resetadas

**Arquivo**: `src/services/flow-engine.service.ts` (método `resetExecution`)

**Mudança**:
- Remove validação que impedia reset de execuções ativas
- Permite resetar qualquer execução, independente do status

**Arquivo**: `src/routes/flow.routes.ts` (rota de reset individual)

**Mudança**:
- Remove validação que impedia reset de execuções ativas
- Permite resetar execuções individuais mesmo quando ativas

### 5. ✅ `startNewFlow` - Exclusão de Flows de Campanhas

**Arquivo**: `src/services/flow-engine.service.ts` (linhas 221-240)

**Mudança**:
- Busca campanhas ativas antes de buscar flows genéricos
- Exclui flows que estão associados a campanhas ativas da busca
- Garante que apenas flows genéricos sejam considerados

## Teste de Diagnóstico

Foi criado um script de teste (`test-campaign-flow-debug.ts`) que:

1. **Simula 3 cenários**:
   - Contato sem execução ativa
   - Contato com execução ativa de flow genérico
   - Contato com execução ativa do flow da campanha

2. **Identifica problemas**:
   - Mostra qual flow seria disparado
   - Detecta conflitos entre execuções genéricas e campanhas
   - Fornece diagnóstico detalhado

3. **Como executar**:
   ```bash
   npx tsx test-campaign-flow-debug.ts
   ```

## Resultado Esperado

Agora, quando um contato da "Campanha 001" (com "flow1") responde:

1. ✅ Sistema verifica campanhas ativas primeiro
2. ✅ Se encontrar "Campanha 001", verifica trigger do "flow1"
3. ✅ Se trigger corresponder → inicia "flow1" (cancela execuções genéricas se houver)
4. ✅ Se trigger não corresponder → cancela execuções genéricas (não inicia flow genérico)
5. ✅ Se houver execução ativa do "flow1" → continua normalmente
6. ✅ Se houver execução ativa de outro flow → cancela e inicia "flow1"

## Logs Adicionados

Todos os pontos críticos agora têm logs detalhados:
- `[Flow Engine] 🎯 Campanhas ativas encontradas`
- `[Flow Engine] ⚠️ Execução ativa NÃO pertence ao flow da campanha. Cancelando execução genérica.`
- `[Webhook] ⚠️ Encontradas X execução(ões) genérica(s). Cancelando para priorizar campanha.`
- `[Flow Engine] 🚫 Flows de campanhas ativas (serão ignorados)`

## Próximos Passos

1. **Executar o teste de diagnóstico** para verificar o estado atual
2. **Testar em ambiente real** enviando mensagem de um contato da campanha
3. **Verificar logs** para confirmar que o flow correto está sendo disparado
4. **Usar "Resetar Flows"** se necessário para limpar execuções antigas

