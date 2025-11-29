import { Client } from 'pg';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

/**
 * Script para criar o banco de dados flow_marketing
 * 
 * Este script conecta ao PostgreSQL e cria o banco de dados
 * se ele não existir.
 */
async function createDatabase() {
  // Extrair informações da DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL não encontrada no arquivo .env');
    process.exit(1);
  }

  // Parse da URL para obter informações de conexão
  const url = new URL(databaseUrl.replace('postgresql://', 'http://'));
  const dbName = url.pathname.split('/')[1]?.split('?')[0] || 'flow_marketing';
  
  // Criar URL de conexão sem o nome do banco (para conectar ao postgres padrão)
  const connectionUrl = `postgresql://${url.username}:${url.password}@${url.hostname}:${url.port || 5432}/postgres`;

  console.log('🔌 Conectando ao PostgreSQL...');
  console.log(`   Host: ${url.hostname}`);
  console.log(`   Port: ${url.port || 5432}`);
  console.log(`   User: ${url.username}`);
  console.log(`📦 Criando banco de dados: ${dbName}`);

  const client = new Client({
    connectionString: connectionUrl,
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    // Verificar se o banco já existe
    const checkDbQuery = `
      SELECT 1 FROM pg_database WHERE datname = $1
    `;
    const dbExists = await client.query(checkDbQuery, [dbName]);

    if (dbExists.rows.length > 0) {
      console.log(`⚠️  Banco de dados '${dbName}' já existe!`);
      console.log('✅ Nada a fazer.');
    } else {
      // Criar banco de dados
      // Nota: CREATE DATABASE não pode ser executado com parâmetros preparados
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Banco de dados '${dbName}' criado com sucesso!`);
    }

    await client.end();
    console.log('\n🎉 Processo concluído!');
    console.log('\n📝 Próximos passos:');
    console.log('   1. Execute: npx prisma migrate dev --name init');
    console.log('   2. (Opcional) Execute: npm run prisma:seed\n');
  } catch (error: any) {
    console.error('❌ Erro ao criar banco de dados:', error.message);
    
    if (error.message.includes('password authentication failed')) {
      console.error('\n💡 Dica: Verifique as credenciais no arquivo .env');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Dica: Certifique-se de que o PostgreSQL está rodando');
    }
    
    await client.end();
    process.exit(1);
  }
}

createDatabase();

