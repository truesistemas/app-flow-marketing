# Flow Engine - Documentação Técnica

## Visão Geral

O Flow Engine é o coração do sistema de automação de mensagens. Ele funciona como uma **máquina de estados** que processa flows de conversa de forma sequencial e assíncrona.

## Arquitetura

```
┌─────────────────┐
│ Evolution API   │
│   (Webhook)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Webhook         │
│ Controller      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Flow Engine     │
│   Service       │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐  ┌───────┐
│ Queue │  │  AI   │
│(BullMQ)│  │Service│
└───────┘  └───────┘
```

## Fluxo de Execução

### 1. Recebimento de Mensagem

Quando uma mensagem chega via webhook da Evolution API:

```typescript
POST /webhook/evolution
{
  "event": "messages.upsert",
  "data": {
    "key": { "remoteJid": "5511999999999@s.whatsapp.net" },
    "message": { "conversation": "oi" }
  }
}
```

### 2. Verificação de Execução Ativa

O engine verifica se o contato já possui uma execução ativa:

```sql
SELECT * FROM flow_executions 
WHERE contact_id = ? 
  AND status = 'WAITING'
ORDER BY updated_at DESC
LIMIT 1
```

**Se encontrar:**
- Continua a execução existente
- Processa a resposta do usuário
- Avança para o próximo nó

**Se não encontrar:**
- Busca um flow ativo com trigger keyword correspondente
- Cria nova execução
- Inicia processamento a partir do nó START

### 3. Processamento de Nós

Cada nó é processado sequencialmente:

#### START Node
- Apenas inicia o flow
- Avança automaticamente para o próximo nó

#### MESSAGE Node
- Substitui variáveis no texto (ex: `{{name}}`)
- Enfileira mensagem para envio via BullMQ
- Avança para próximo nó

#### MEDIA Node
- Enfileira mídia para envio via BullMQ
- Avança para próximo nó

#### ACTION Node
- **PAUSA A EXECUÇÃO**
- Atualiza status para `WAITING`
- Salva contexto atual
- Aguarda próxima mensagem do usuário

#### HTTP Node
- Faz requisição HTTP externa
- Substitui variáveis na URL e body
- Salva resposta no contexto (se configurado)
- Avança para próximo nó

#### AI Node
- Chama serviço de IA (OpenAI/Gemini/Anthropic)
- Substitui variáveis no prompt
- Envia resposta como mensagem
- Salva resposta no contexto
- Avança para próximo nó

#### CONDITION Node
- Avalia condição usando variáveis do contexto
- Escolhe edge baseado no resultado (true/false)
- Avança para nó correspondente

#### END Node
- Envia mensagem final (se configurada)
- Finaliza execução (status: `COMPLETED`)

## Estados da Execução

```typescript
enum FlowStatus {
  WAITING      // Aguardando resposta do usuário
  PROCESSING   // Processando nó atual
  COMPLETED    // Flow finalizado
  ABANDONED    // Flow abandonado (timeout ou erro)
}
```

## Contexto de Execução

O contexto (`contextData`) armazena:

```typescript
{
  variables: {
    "userQuestion": "Como funciona?",
    "aiResponse": "O sistema funciona assim...",
    // ... outras variáveis
  },
  userResponses: [
    {
      nodeId: "action-1",
      timestamp: "2024-01-01T10:00:00Z",
      response: "Como funciona?"
    }
  ],
  executedNodes: [
    {
      nodeId: "start-1",
      timestamp: "2024-01-01T10:00:00Z",
      nodeType: "START"
    }
  ],
  metadata: {
    // Dados adicionais
  }
}
```

## Substituição de Variáveis

Variáveis são substituídas usando a sintaxe `{{variableName}}`:

**Exemplo:**
```json
{
  "text": "Olá {{name}}! Sua pergunta foi: {{userQuestion}}"
}
```

Com contexto:
```json
{
  "variables": {
    "name": "João",
    "userQuestion": "Como funciona?"
  }
}
```

Resultado: `"Olá João! Sua pergunta foi: Como funciona?"`

## Tratamento de Erros

- **Erro em HTTP Node**: Avança para próximo nó (não bloqueia flow)
- **Erro em AI Node**: Avança para próximo nó (não bloqueia flow)
- **Erro crítico**: Abandona execução (status: `ABANDONED`)

## Timeout

ActionNodes podem ter timeout configurado:

```json
{
  "config": {
    "actionType": "WAIT_RESPONSE",
    "timeout": 300  // 5 minutos
  }
}
```

**TODO**: Implementar timeout usando BullMQ delayed jobs.

## Exemplo Completo

### Flow JSON
```json
{
  "nodes": [
    {
      "id": "start-1",
      "type": "START",
      "config": { "triggerType": "KEYWORD", "keyword": "oi" }
    },
    {
      "id": "msg-1",
      "type": "MESSAGE",
      "config": { "text": "Olá! Como posso ajudar?" }
    },
    {
      "id": "action-1",
      "type": "ACTION",
      "config": { "actionType": "WAIT_RESPONSE", "saveResponseAs": "question" }
    },
    {
      "id": "ai-1",
      "type": "AI",
      "config": {
        "provider": "OPENAI",
        "model": "gpt-4",
        "userPrompt": "Responda: {{question}}"
      }
    }
  ],
  "edges": [
    { "source": "start-1", "target": "msg-1" },
    { "source": "msg-1", "target": "action-1" },
    { "source": "action-1", "target": "ai-1" }
  ]
}
```

### Fluxo de Execução

1. **Usuário envia**: `"oi"`
2. **Engine cria execução** e processa `start-1` → `msg-1`
3. **Mensagem enviada**: `"Olá! Como posso ajudar?"`
4. **Processa `action-1`**: Pausa e aguarda resposta
5. **Usuário envia**: `"Como funciona o sistema?"`
6. **Engine continua**: Processa resposta, salva em `variables.question`
7. **Processa `ai-1`**: Chama OpenAI com prompt `"Responda: Como funciona o sistema?"`
8. **Resposta da IA enviada** como mensagem
9. **Flow finaliza** (sem próximo nó)

## Performance

- **Processamento assíncrono**: Mensagens são enfileiradas via BullMQ
- **Concorrência**: Até 10 mensagens simultâneas por worker
- **Rate limiting**: 100 mensagens/segundo por fila
- **Retry**: 3 tentativas com backoff exponencial

## Monitoramento

Use `MessageQueueService.getQueueStats()` para monitorar:

```typescript
const stats = await messageQueue.getQueueStats();
// {
//   messages: { waiting: 5, active: 2, completed: 1000, failed: 3 },
//   media: { waiting: 1, active: 0, completed: 500, failed: 0 }
// }
```






