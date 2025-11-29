# Bloqueio Absoluto de Flows Genéricos para Contatos de Campanhas

## Regra Absoluta Implementada

**Para contatos de campanhas ativas:**
- ✅ **APENAS** o flow anexado à campanha pode ser executado
- 🚫 **NUNCA** flows genéricos serão executados
- 🚫 **NENHUMA** alternativa ou exceção

## Implementação

### 1. `processIncomingMessage` - Bloqueio Total

**Arquivo**: `src/services/flow-engine.service.ts` (linhas 189-228)

**Comportamento**:
- Se há campanha ativa → **BLOQUEIA** completamente flows genéricos
- Tenta iniciar flow da campanha (se trigger corresponder)
- Se trigger não corresponder → **NÃO** inicia flow genérico (bloqueado)
- Logs claros: `🚫 BLOQUEADO: Há X campanha(s) ativa(s). Flows genéricos NÃO serão executados.`

### 2. `startNewFlow` - Verificação Preventiva

**Arquivo**: `src/services/flow-engine.service.ts` (linhas 290-350)

**Comportamento**:
- Verifica campanhas ativas **ANTES** de buscar flows genéricos
- Se há campanha ativa → **RETORNA IMEDIATAMENTE** sem buscar flows genéricos
- Logs claros: `🚫 BLOQUEADO: Há X campanha(s) ativa(s). Flows genéricos NÃO serão executados.`

### 3. Webhook Controller - Bloqueio Duplo

**Arquivo**: `src/controllers/webhook.controller.ts` (linhas 248-280)

**Comportamento**:
- Verifica campanhas ativas **ANTES** de chamar `processIncomingMessage`
- Se há campanha ativa → **NÃO** chama `processIncomingMessage` (bloqueia)
- Retorna resposta com `blocked: true` e `reason: 'active_campaign'`
- Logs claros: `🚫 BLOQUEADO: Campanha ativa encontrada. Flows genéricos NÃO serão executados.`

### 4. WebSocket Service - Bloqueio Duplo

**Arquivo**: `src/services/websocket-evolution.service.ts` (linhas 322-340)

**Comportamento**:
- Verifica campanhas ativas **ANTES** de chamar `processIncomingMessage`
- Se há campanha ativa → **NÃO** chama `processIncomingMessage` (bloqueia)
- Logs claros: `🚫 BLOQUEADO: Campanha ativa encontrada. Flows genéricos NÃO serão executados.`

## Fluxo de Decisão

```
Mensagem Recebida
    ↓
Há campanha ativa para o contato?
    ↓ SIM
        ↓
    Há execução ativa?
        ↓ SIM
            ↓
        Execução é do flow da campanha?
            ↓ SIM → Continua execução ✅
            ↓ NÃO → Cancela execução genérica → Tenta iniciar flow da campanha
        ↓ NÃO
            ↓
        Trigger do flow da campanha corresponde?
            ↓ SIM → Inicia flow da campanha ✅
            ↓ NÃO → BLOQUEADO (não inicia flow genérico) 🚫
    ↓ NÃO
        ↓
    Processa flows genéricos normalmente ✅
```

## Logs de Bloqueio

Todos os pontos de bloqueio agora têm logs claros:

```
[Flow Engine] 🚫 BLOQUEADO: Há 1 campanha(s) ativa(s) para este contato.
[Flow Engine] 🚫 Flows genéricos NÃO serão executados. Apenas o flow da campanha pode ser usado.
[Flow Engine] 🎯 Tentando iniciar flow da campanha: flow1 (6e31c82c-...)
```

```
[Webhook] 🚫 BLOQUEADO: Campanha ativa encontrada para contato 5511999999999.
[Webhook] 🚫 Flows genéricos NÃO serão executados. Apenas o flow da campanha é permitido.
[Webhook] 🎯 Campanha: Campanha 001 (Flow: flow1)
```

## Garantias

✅ **Múltiplas camadas de bloqueio**:
1. Webhook Controller verifica antes de chamar `processIncomingMessage`
2. `processIncomingMessage` verifica antes de chamar `startNewFlow`
3. `startNewFlow` verifica antes de buscar flows genéricos

✅ **Cancelamento automático**:
- Execuções ativas de flows genéricos são canceladas automaticamente
- `startFlowFromCampaign` cancela todas as execuções genéricas

✅ **Logs detalhados**:
- Todos os bloqueios são logados claramente
- Fácil identificar quando e por que flows genéricos foram bloqueados

## Teste

Execute o script de teste para verificar:

```bash
npx tsx test-campaign-flow-debug.ts
```

O teste mostrará:
- ✅ Cenário 1: Sem execução → Flow da campanha seria iniciado
- ❌ Cenário 2: Com execução genérica → Seria cancelada e flow da campanha iniciado
- ✅ Cenário 3: Com execução da campanha → Seria continuada corretamente

## Resultado Final

**Para contatos de campanhas:**
- ✅ **SEMPRE** usa o flow anexado à campanha
- 🚫 **NUNCA** executa flows genéricos
- 🚫 **ZERO** alternativas ou exceções


