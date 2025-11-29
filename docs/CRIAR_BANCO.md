# Como Criar o Banco de Dados

## Opção 1: Usando o Script Automático (Recomendado)

O script `create-database.ts` cria o banco automaticamente, mas **requer que a senha do PostgreSQL esteja correta** no arquivo `.env`.

### Passos:

1. **Verifique/Atualize a senha no arquivo `.env`:**

```env
DATABASE_URL="postgresql://postgres:SUA_SENHA_AQUI@localhost:5432/flow_marketing?schema=public"
```

2. **Execute o script:**

```bash
npm run db:create
```

## Opção 2: Criar Manualmente via SQL

Se preferir criar manualmente, você pode usar qualquer cliente PostgreSQL:

### Usando psql (linha de comando):

```bash
psql -U postgres -h localhost

# No prompt do PostgreSQL:
CREATE DATABASE flow_marketing;
\q
```

### Usando pgAdmin ou DBeaver:

1. Conecte ao servidor PostgreSQL
2. Clique com botão direito em "Databases"
3. Selecione "Create Database"
4. Nome: `flow_marketing`
5. Clique em "Save"

## Opção 3: Usando Prisma Migrate (Cria automaticamente)

O Prisma pode criar o banco automaticamente se você usar:

```bash
npx prisma migrate dev --name init --create-only
```

Mas isso requer que a `DATABASE_URL` esteja correta e que você tenha permissões para criar bancos.

## Verificar se o Banco Foi Criado

Após criar o banco, você pode verificar:

```bash
# Listar bancos de dados
psql -U postgres -h localhost -c "\l"

# Ou conectar e verificar
psql -U postgres -h localhost -d flow_marketing -c "SELECT current_database();"
```

## Troubleshooting

### Erro: "password authentication failed"

- Verifique se a senha no `.env` está correta
- Teste a conexão manualmente: `psql -U postgres -h localhost`
- Se não souber a senha, você pode redefini-la no PostgreSQL

### Erro: "could not connect to server"

- Verifique se o PostgreSQL está rodando
- No Windows: Verifique o serviço "postgresql-x64-XX" nos Serviços
- No Linux/Mac: `sudo systemctl status postgresql` ou `brew services list`

### Erro: "permission denied to create database"

- Você precisa de permissões de superusuário
- Use o usuário `postgres` ou outro usuário com privilégios

## Próximos Passos

Após criar o banco de dados:

1. Execute as migrações:
   ```bash
   npx prisma migrate dev --name init
   ```

2. (Opcional) Popular com dados de exemplo:
   ```bash
   npm run prisma:seed
   ```

