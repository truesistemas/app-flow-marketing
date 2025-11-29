# Guia de Setup - Flow Marketing Backend

## Pré-requisitos

- Node.js >= 18.0.0
- PostgreSQL >= 14.0
- Redis >= 6.0
- Evolution API configurada e rodando

## Passo a Passo

### 1. Clone e Instale Dependências

```bash
npm install
```

### 2. Configure Variáveis de Ambiente

Copie `.env.example` para `.env`:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```env
# Database
DATABASE_URL="postgresql://usuario:senha@localhost:5432/flow_marketing?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_INSTANCE_NAME=default

# AI Providers (opcional - apenas se usar nós de IA)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
```

### 3. Configure o Banco de Dados

```bash
# Gerar cliente Prisma
npm run prisma:generate

# Criar banco de dados (se ainda não existir)
createdb flow_marketing

# Executar migrações
npm run prisma:migrate

# (Opcional) Popular com dados de exemplo
npm run prisma:seed
```

### 4. Inicie o Redis

**Linux/Mac:**
```bash
redis-server
```

**Windows:**
```bash
# Instale Redis via WSL ou use Docker
docker run -d -p 6379:6379 redis:alpine
```

### 5. Configure a Evolution API

Certifique-se de que a Evolution API está rodando e configurada para enviar webhooks para:

```
http://seu-servidor:3000/webhook/evolution
```

### 6. Inicie o Servidor

**Desenvolvimento:**
```bash
npm run dev
```

**Produção:**
```bash
npm run build
npm start
```

## Verificação

### Health Check

```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T10:00:00.000Z"
}
```

### Testar Webhook

```bash
curl -X POST http://localhost:3000/webhook/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "default",
    "data": {
      "key": {
        "remoteJid": "5511999999999@s.whatsapp.net",
        "fromMe": false
      },
      "message": {
        "conversation": "oi"
      },
      "messageType": "conversation"
    }
  }'
```

## Estrutura do Banco de Dados

Após executar as migrações, você terá as seguintes tabelas:

- `organizations` - Organizações (multi-tenancy)
- `users` - Usuários do sistema
- `contacts` - Contatos do WhatsApp
- `flows` - Fluxos de conversa
- `flow_executions` - Execuções ativas de flows

## Próximos Passos

1. **Criar uma Organização** via API ou Prisma Studio:
   ```bash
   npm run prisma:studio
   ```

2. **Criar um Flow** com trigger keyword

3. **Testar** enviando mensagem via WhatsApp com a keyword configurada

## Troubleshooting

### Erro: "Prisma Client não encontrado"
```bash
npm run prisma:generate
```

### Erro: "Cannot connect to Redis"
- Verifique se o Redis está rodando
- Confirme as credenciais no `.env`

### Erro: "Cannot connect to PostgreSQL"
- Verifique se o PostgreSQL está rodando
- Confirme a `DATABASE_URL` no `.env`
- Certifique-se de que o banco de dados existe

### Webhook não está sendo recebido
- Verifique se a Evolution API está configurada corretamente
- Confirme a URL do webhook na Evolution API
- Verifique os logs do servidor

## Desenvolvimento

### Prisma Studio

Visualize e edite dados diretamente:

```bash
npm run prisma:studio
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## Produção

### Variáveis de Ambiente

Certifique-se de configurar todas as variáveis de ambiente no ambiente de produção.

### Build

```bash
npm run build
```

### Migrations

Execute migrações antes de iniciar:

```bash
npm run prisma:migrate
```

### Process Manager

Use PM2 ou similar:

```bash
pm2 start dist/index.js --name flow-marketing
```






