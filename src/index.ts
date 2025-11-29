import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { MessageQueueService } from './services/message-queue.service';
import { AIService } from './services/ai.service';
import { HttpService } from './services/http.service';
import { FlowEngineService } from './services/flow-engine.service';
import { WebhookController } from './controllers/webhook.controller';
import { webSocketEvolutionService } from './services/websocket-evolution.service';
import { authRoutes } from './routes/auth.routes';
import { campaignRoutes } from './routes/campaign.routes';
import { flowRoutes } from './routes/flow.routes';
import { evolutionInstanceRoutes } from './routes/evolution-instance.routes';
import { contactRoutes } from './routes/contact.routes';
import { mediaRoutes } from './routes/media.routes';

/**
 * Aplicação principal
 */
async function bootstrap() {
  // Inicializar Prisma
  const prisma = new PrismaClient();
  
  // Configurar Prisma para desconectar ao encerrar
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });

  // Inicializar serviços
  const messageQueue = new MessageQueueService();
  const aiService = new AIService();
  const httpService = new HttpService();
  const flowEngine = new FlowEngineService(prisma, messageQueue, aiService, httpService);

  // Configurar Flow Engine no WebSocket service para processar mensagens recebidas
  // O nó START de cada flow ativo será verificado para iniciar o fluxo
  webSocketEvolutionService.setFlowEngine(flowEngine, prisma);

  // Conectar instâncias WebSocket existentes ao iniciar o servidor
  try {
    const instances = await prisma.evolutionInstance.findMany({
      where: {
        status: 'ACTIVE',
        // Adicionar filtro quando o schema tiver integrationType
        // integrationType: 'WEBSOCKET',
      },
    });

    for (const instance of instances) {
      // Tentar conectar WebSocket se a instância tiver configuração WebSocket
      // Por enquanto, vamos tentar conectar todas as instâncias ativas
      // (isso será refinado quando o schema tiver o campo integrationType)
      try {
        await webSocketEvolutionService.connect({
          apiUrl: instance.apiUrl,
          instanceName: instance.instanceName,
          apiKey: instance.apiKey || undefined,
          organizationId: instance.organizationId,
          globalMode: false, // Será lido do banco quando o schema tiver o campo
        });
        console.log(`[Bootstrap] WebSocket conectado para instância ${instance.instanceName}`);
      } catch (error: any) {
        console.warn(`[Bootstrap] Não foi possível conectar WebSocket para ${instance.instanceName}:`, error.message);
      }
    }
  } catch (error: any) {
    console.warn('[Bootstrap] Erro ao conectar instâncias WebSocket:', error.message);
  }

  // Inicializar controllers
  const webhookController = new WebhookController(
    prisma,
    messageQueue,
    aiService,
    httpService
  );

  // Inicializar Fastify
  const app = Fastify({
    logger: true,
  });

  // Registrar plugins
  await app.register(fastifyCors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  });

  // Servir arquivos estáticos de uploads
  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
  });

  // Registrar rotas públicas
  app.post<{
    Body: {
      event: string;
      instance: string;
      data: {
        key: {
          remoteJid: string;
          fromMe?: boolean;
        };
        message: {
          conversation?: string;
          extendedTextMessage?: { text: string };
          imageMessage?: any;
          videoMessage?: any;
          documentMessage?: any;
        };
        messageType: string;
        pushName?: string;
      };
    };
  }>('/webhook/evolution', async (request, reply) => {
    return webhookController.handleEvolutionWebhook(request, reply);
  });

  app.get('/health', async (request, reply) => {
    return webhookController.healthCheck(request, reply);
  });

  // Registrar rotas da API
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(campaignRoutes, { prefix: '/api/campaigns' });
  await app.register(flowRoutes, { prefix: '/api/flows' });
  await app.register(evolutionInstanceRoutes, { prefix: '/api/evolution-instances' });
  await app.register(mediaRoutes, { prefix: '/api/media' });
  await app.register(contactRoutes, { prefix: '/api/contacts' });

  // Iniciar servidor
  const port = parseInt(process.env.PORT || '3000');
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`🚀 Servidor rodando em http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Encerrando servidor...');
    await app.close();
    await messageQueue.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  console.error('Erro ao iniciar aplicação:', error);
  process.exit(1);
});

