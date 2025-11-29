import { io, Socket } from 'socket.io-client';
import { webhookEventTracker, WebhookEvent } from './webhook-event-tracker.service';
import { FlowEngineService } from './flow-engine.service';
import { PrismaClient } from '@prisma/client';

/**
 * Serviço para gerenciar conexões WebSocket com a Evolution API
 * Documentação: https://doc.evolution-api.com/v2/en/integrations/websocket
 */
export interface WebSocketConnectionConfig {
  apiUrl: string;
  instanceName: string;
  apiKey?: string;
  organizationId: string;
  globalMode?: boolean; // Se true, usa modo global (sem /instance_name na URL)
}

export interface WebSocketConnectionStatus {
  connected: boolean;
  instanceName: string;
  organizationId: string;
  lastEventAt?: Date;
  error?: string;
}

export class WebSocketEvolutionService {
  private connections: Map<string, Socket> = new Map(); // instanceId -> Socket
  private connectionStatuses: Map<string, WebSocketConnectionStatus> = new Map();
  private eventHandlers: Map<string, Set<(event: any) => void>> = new Map();
  private flowEngine?: FlowEngineService;
  private prisma?: PrismaClient;

  /**
   * Configurar Flow Engine para processar mensagens recebidas via WebSocket
   */
  setFlowEngine(flowEngine: FlowEngineService, prisma: PrismaClient) {
    this.flowEngine = flowEngine;
    this.prisma = prisma;
    console.log('[WebSocket] Flow Engine configurado para processar mensagens');
  }

  /**
   * Conectar a uma instância via WebSocket
   * Documentação: https://doc.evolution-api.com/v2/en/integrations/websocket
   */
  async connect(config: WebSocketConnectionConfig): Promise<Socket> {
    const connectionKey = `${config.organizationId}-${config.instanceName}`;

    // Se já existe conexão, retornar existente
    if (this.connections.has(connectionKey)) {
      const existingSocket = this.connections.get(connectionKey)!;
      if (existingSocket.connected) {
        console.log(`[WebSocket] Conexão já existe e está ativa para ${config.instanceName}`);
        return existingSocket;
      } else {
        // Desconectar e reconectar
        existingSocket.disconnect();
        this.connections.delete(connectionKey);
      }
    }

    // Construir URL do WebSocket
    let wsUrl: string;
    
    // Detectar se deve usar modo global baseado na URL ou configuração
    // Se a URL for localhost ou se globalMode estiver true, usar modo global
    const isLocalhost = config.apiUrl.includes('localhost') || config.apiUrl.includes('127.0.0.1');
    const useGlobalMode = config.globalMode !== undefined ? config.globalMode : isLocalhost;
    
    if (useGlobalMode) {
      // Modo global: ws://localhost:8085 ou wss://api.yoursite.com
      // Remove protocolo HTTP/HTTPS e adiciona WSS/WS
      const baseUrl = config.apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      // Para localhost, usar ws://, para outros usar wss://
      const protocol = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') ? 'ws' : 'wss';
      wsUrl = `${protocol}://${baseUrl}`;
    } else {
      // Modo tradicional: wss://api.yoursite.com/instance_name
      const baseUrl = config.apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      // Para localhost, usar ws://, para outros usar wss://
      const protocol = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') ? 'ws' : 'wss';
      wsUrl = `${protocol}://${baseUrl}/${config.instanceName}`;
    }

    console.log(`[WebSocket] Conectando a ${wsUrl} para instância ${config.instanceName}`);
    console.log(`[WebSocket] Modo: ${useGlobalMode ? 'Global' : 'Tradicional'}`);

    // Criar conexão socket.io
    // Configuração conforme documentação: https://doc.evolution-api.com/v2/en/integrations/websocket
    const socketOptions: any = {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
      forceNew: false,
    };

    // Adicionar autenticação se API Key fornecida
    if (config.apiKey) {
      socketOptions.auth = {
        apikey: config.apiKey,
      };
      // Também tentar no header (algumas versões da Evolution API podem usar isso)
      socketOptions.extraHeaders = {
        apikey: config.apiKey,
      };
    }

    const socket = io(wsUrl, socketOptions);

    console.log(`[WebSocket] Socket.io configurado para ${wsUrl}`);
    console.log(`[WebSocket] API Key configurada: ${config.apiKey ? 'Sim' : 'Não'}`);
    console.log(`[WebSocket] Opções de conexão:`, JSON.stringify(socketOptions, null, 2));

    // Evento: conectado
    socket.on('connect', () => {
      console.log(`[WebSocket] ✅ Conectado à instância ${config.instanceName}`);
      console.log(`[WebSocket] Socket ID: ${socket.id}`);
      console.log(`[WebSocket] URL: ${wsUrl}`);
      console.log(`[WebSocket] Transport: ${socket.io.engine?.transport?.name || 'N/A'}`);
      
      this.connectionStatuses.set(connectionKey, {
        connected: true,
        instanceName: config.instanceName,
        organizationId: config.organizationId,
        lastEventAt: new Date(),
      });
    });

    // Evento: desconectado
    socket.on('disconnect', (reason) => {
      console.log(`[WebSocket] Desconectado da instância ${config.instanceName}: ${reason}`);
      
      const status = this.connectionStatuses.get(connectionKey);
      if (status) {
        status.connected = false;
        status.error = reason;
      }
    });

    // Evento: erro de conexão
    socket.on('connect_error', (error) => {
      console.error(`[WebSocket] ❌ Erro ao conectar à instância ${config.instanceName}:`, error.message);
      console.error(`[WebSocket] Detalhes do erro:`, error);
      console.error(`[WebSocket] URL tentada: ${wsUrl}`);
      console.error(`[WebSocket] Verifique se WEBSOCKET_ENABLED=true na Evolution API`);
      
      this.connectionStatuses.set(connectionKey, {
        connected: false,
        instanceName: config.instanceName,
        organizationId: config.organizationId,
        error: error.message,
      });
    });

    // Função auxiliar para processar eventos
    const processEvent = (eventName: string, data: any) => {
      console.log(`[WebSocket] Evento recebido de ${config.instanceName}: ${eventName}`, JSON.stringify(data, null, 2));
      
      // Atualizar último evento
      const status = this.connectionStatuses.get(connectionKey);
      if (status) {
        status.lastEventAt = new Date();
      }

      // Registrar evento no tracker (para testes e nó de webhook)
      const webhookEvent: WebhookEvent = {
        id: `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        instance: config.instanceName,
        event: eventName,
        data: data,
        receivedAt: new Date(),
        organizationId: config.organizationId,
      };

      webhookEventTracker.registerEvent(webhookEvent);

      // Notificar handlers específicos
      const handlers = this.eventHandlers.get(connectionKey);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler({ event: eventName, data });
          } catch (error) {
            console.error(`[WebSocket] Erro ao executar handler para ${eventName}:`, error);
          }
        });
      }
    };

    // Escutar eventos específicos da Evolution API
    // Eventos principais de mensagens
    socket.on('messages.upsert', async (eventData) => {
      console.log(`[WebSocket] 📨 messages.upsert recebido de ${config.instanceName}`);
      processEvent('messages.upsert', eventData);

      // Processar mensagem através do Flow Engine (similar ao webhook)
      // O nó START de cada flow ativo será verificado para iniciar o fluxo
      if (this.flowEngine && this.prisma) {
        try {
          // O evento pode vir em dois formatos:
          // 1. Direto: { key: {...}, message: {...} }
          // 2. Encapsulado: { event, instance, data: { key: {...}, message: {...} } }
          // Baseado nos logs, o formato é: { event, instance, data: { key, message } }
          // IMPORTANTE: Se eventData tem propriedade 'data', usar eventData.data, senão usar eventData diretamente
          const messageData = (eventData && typeof eventData === 'object' && 'data' in eventData) 
            ? eventData.data 
            : eventData;
          
          console.log(`[WebSocket] 🔍 Debug - eventData tipo:`, typeof eventData);
          console.log(`[WebSocket] 🔍 Debug - eventData tem 'data'?`, !!(eventData && typeof eventData === 'object' && 'data' in eventData));
          console.log(`[WebSocket] 🔍 Debug - messageData tipo:`, typeof messageData);
          console.log(`[WebSocket] 🔍 Debug - messageData tem 'key'?`, !!(messageData && messageData.key));
          console.log(`[WebSocket] 🔍 Debug - messageData tem 'message'?`, !!(messageData && messageData.message));
          console.log(`[WebSocket] 🔍 Debug - remoteJid:`, messageData?.key?.remoteJid);
          
          // Ignorar mensagens enviadas por nós (fromMe = true)
          if (messageData?.key?.fromMe) {
            console.log(`[WebSocket] Mensagem ignorada (enviada por nós): ${config.instanceName}`);
            return;
          }

          // Extrair número do telefone (formato: 5511999999999@s.whatsapp.net)
          const remoteJid = messageData?.key?.remoteJid;
          if (!remoteJid) {
            console.log(`[WebSocket] ⚠️ Mensagem ignorada (sem remoteJid): ${config.instanceName}`);
            console.log(`[WebSocket] 🔍 Debug - eventData completo:`, JSON.stringify(eventData, null, 2));
            console.log(`[WebSocket] 🔍 Debug - messageData completo:`, JSON.stringify(messageData, null, 2));
            return;
          }

          const phone = remoteJid.split('@')[0];

          // Extrair texto da mensagem
          let messageText = '';
          if (messageData.message?.conversation) {
            messageText = messageData.message.conversation;
          } else if (messageData.message?.extendedTextMessage?.text) {
            messageText = messageData.message.extendedTextMessage.text;
          } else {
            // Mensagem de mídia ou outro tipo não suportado
            console.log(`[WebSocket] Mensagem ignorada (tipo não suportado): ${config.instanceName}`);
            return;
          }

          if (!messageText || messageText.trim() === '') {
            console.log(`[WebSocket] Mensagem ignorada (texto vazio): ${config.instanceName}`);
            return;
          }

          console.log(`[WebSocket] ✅ Processando mensagem via Flow Engine: ${phone} - "${messageText}"`);

          // Processar mensagem através do Flow Engine
          // O Flow Engine verifica o nó START de cada flow ativo e inicia o fluxo se o trigger corresponder
          await this.flowEngine.processIncomingMessage({
            phone,
            message: messageText,
            organizationId: config.organizationId,
            messageId: remoteJid,
            timestamp: new Date(),
          });

          console.log(`[WebSocket] ✅ Mensagem processada pelo Flow Engine: ${phone}`);

          // Verificar campanhas ativas para este contato (similar ao webhook)
          const contact = await this.prisma.contact.findFirst({
            where: {
              phone,
              organizationId: config.organizationId,
            },
          });

          if (contact) {
            // Buscar campanhas ativas onde este contato recebeu mensagem
            const activeCampaigns = await this.prisma.campaign.findMany({
              where: {
                organizationId: config.organizationId,
                status: 'RUNNING',
                leads: {
                  some: {
                    contactId: contact.id,
                    status: 'SENT', // Mensagem já foi enviada
                  },
                },
              },
              include: {
                flow: true,
              },
            });

            // Para cada campanha ativa, verificar se a resposta corresponde ao trigger do flow
            let campaignFlowStarted = false;
            for (const campaign of activeCampaigns) {
              if (campaign.flow) {
                const flowStructure = campaign.flow.nodes as any[];
                const startNode = flowStructure.find((node: any) => node.type === 'START');
                
                if (startNode) {
                  // Verificar se o trigger corresponde
                  const triggerMatches = this.checkTriggerMatch(startNode, messageText);
                  
                  if (triggerMatches) {
                    console.log(`[WebSocket] ✅ Trigger corresponde para campanha ${campaign.name} (Flow: ${campaign.flow.name})`);
                    
                    // Iniciar flow através do método startFlowFromCampaign
                    if (this.flowEngine) {
                      await this.flowEngine.startFlowFromCampaign(
                        contact.id,
                        campaign.flow.id,
                        config.organizationId,
                        campaign.id
                      );
                      campaignFlowStarted = true;
                      break;
                    }
                  }
                }
              }
            }
            
            // CRÍTICO: Se há campanha ativa, NUNCA processar flows genéricos
            // Verificar novamente se há campanha ativa antes de processar genéricos
            if (!campaignFlowStarted && this.flowEngine) {
              const hasActiveCampaigns = await this.prisma!.campaign.findFirst({
                where: {
                  organizationId: config.organizationId,
                  status: 'RUNNING',
                  leads: {
                    some: {
                      contactId: contact.id,
                      status: { in: ['SENT', 'DELIVERED', 'READ', 'REPLIED'] },
                    },
                  },
                },
              });

              if (hasActiveCampaigns) {
                console.log(`[WebSocket] 🚫 BLOQUEADO: Campanha ativa encontrada. Flows genéricos NÃO serão executados.`);
                return; // NÃO processar flows genéricos
              }

              // Se não há campanha ativa, processar mensagem normalmente (flows genéricos)
              console.log(`[WebSocket] ✅ Nenhuma campanha ativa. Processando flows genéricos...`);
              await this.flowEngine.processIncomingMessage({
                phone,
                message: messageText,
                organizationId: config.organizationId,
                messageId: remoteJid,
                timestamp: new Date(),
              });
            }
          }
        } catch (error: any) {
          console.error(`[WebSocket] ❌ Erro ao processar mensagem via Flow Engine:`, error.message);
          console.error(`[WebSocket] Stack trace:`, error.stack);
        }
      } else {
        console.log(`[WebSocket] ⚠️ Flow Engine não configurado. Mensagem não será processada.`);
      }
    });

    socket.on('messages.update', (data) => {
      console.log(`[WebSocket] 📨 messages.update recebido de ${config.instanceName}`);
      processEvent('messages.update', data);
    });

    socket.on('connection.update', (data) => {
      console.log(`[WebSocket] 🔌 connection.update recebido de ${config.instanceName}`);
      processEvent('connection.update', data);
    });

    socket.on('qrcode.updated', (data) => {
      console.log(`[WebSocket] 📱 qrcode.updated recebido de ${config.instanceName}`);
      processEvent('qrcode.updated', data);
    });

    // Outros eventos comuns da Evolution API
    socket.on('chats.update', (data) => {
      console.log(`[WebSocket] 💬 chats.update recebido de ${config.instanceName}`);
      processEvent('chats.update', data);
    });

    socket.on('contacts.update', (data) => {
      console.log(`[WebSocket] 👤 contacts.update recebido de ${config.instanceName}`);
      processEvent('contacts.update', data);
    });

    // Escutar eventos genéricos (fallback para outros eventos)
    socket.onAny((eventName, data) => {
      // Ignorar eventos internos do socket.io
      if (eventName === 'connect' || eventName === 'disconnect' || eventName === 'connect_error' || eventName === 'error') {
        return;
      }
      
      // Processar apenas se não foi processado pelos listeners específicos acima
      // (onAny é chamado para todos os eventos, incluindo os já escutados)
      console.log(`[WebSocket] 📨 Evento genérico recebido de ${config.instanceName}: ${eventName}`);
      processEvent(eventName, data);
    });

    // Escutar erros do socket
    socket.on('error', (error) => {
      console.error(`[WebSocket] ❌ Erro no socket de ${config.instanceName}:`, error);
    });

    // Armazenar conexão
    this.connections.set(connectionKey, socket);
    this.connectionStatuses.set(connectionKey, {
      connected: socket.connected,
      instanceName: config.instanceName,
      organizationId: config.organizationId,
    });

    // Log de debug: verificar se socket está conectado
    console.log(`[WebSocket] Socket armazenado para ${config.instanceName}`);
    console.log(`[WebSocket] Status inicial: ${socket.connected ? 'Conectado' : 'Desconectado'}`);
    
    // Aguardar um pouco para verificar se a conexão foi estabelecida
    setTimeout(() => {
      const currentStatus = this.connectionStatuses.get(connectionKey);
      console.log(`[WebSocket] Status após 1s: ${socket.connected ? 'Conectado' : 'Desconectado'}`);
      if (currentStatus) {
        console.log(`[WebSocket] Status no tracker: ${currentStatus.connected ? 'Conectado' : 'Desconectado'}`);
      }
    }, 1000);

    return socket;
  }

  /**
   * Desconectar de uma instância
   */
  disconnect(organizationId: string, instanceName: string): void {
    const connectionKey = `${organizationId}-${instanceName}`;
    const socket = this.connections.get(connectionKey);

    if (socket) {
      console.log(`[WebSocket] Desconectando da instância ${instanceName}`);
      socket.disconnect();
      this.connections.delete(connectionKey);
      this.connectionStatuses.delete(connectionKey);
      this.eventHandlers.delete(connectionKey);
    }
  }

  /**
   * Obter status da conexão
   */
  getConnectionStatus(organizationId: string, instanceName: string): WebSocketConnectionStatus | null {
    const connectionKey = `${organizationId}-${instanceName}`;
    return this.connectionStatuses.get(connectionKey) || null;
  }

  /**
   * Verificar se está conectado
   */
  isConnected(organizationId: string, instanceName: string): boolean {
    const connectionKey = `${organizationId}-${instanceName}`;
    const socket = this.connections.get(connectionKey);
    return socket?.connected || false;
  }

  /**
   * Adicionar handler para eventos específicos
   */
  onEvent(
    organizationId: string,
    instanceName: string,
    handler: (event: { event: string; data: any }) => void
  ): void {
    const connectionKey = `${organizationId}-${instanceName}`;
    
    if (!this.eventHandlers.has(connectionKey)) {
      this.eventHandlers.set(connectionKey, new Set());
    }
    
    this.eventHandlers.get(connectionKey)!.add(handler);
  }

  /**
   * Remover handler
   */
  offEvent(
    organizationId: string,
    instanceName: string,
    handler: (event: { event: string; data: any }) => void
  ): void {
    const connectionKey = `${organizationId}-${instanceName}`;
    const handlers = this.eventHandlers.get(connectionKey);
    
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Desconectar todas as conexões
   */
  disconnectAll(): void {
    console.log('[WebSocket] Desconectando todas as conexões');
    
    for (const [key, socket] of this.connections.entries()) {
      socket.disconnect();
    }
    
    this.connections.clear();
    this.connectionStatuses.clear();
    this.eventHandlers.clear();
  }

  /**
   * Verifica se o trigger do nó START corresponde à mensagem recebida
   */
  private checkTriggerMatch(startNode: any, message: string): boolean {
    const { triggerType, keyword } = startNode.config || {};
    const messageLower = message.trim().toLowerCase();
    const keywordLower = keyword?.toLowerCase() || '';

    switch (triggerType) {
      case 'KEYWORD_EXACT':
        return messageLower === keywordLower;
      
      case 'KEYWORD_CONTAINS':
        return messageLower.includes(keywordLower);
      
      case 'KEYWORD_STARTS_WITH':
        return messageLower.startsWith(keywordLower);
      
      case 'ANY_RESPONSE':
        return message.trim().length > 0;
      
      default:
        return false;
    }
  }
}

// Singleton
export const webSocketEvolutionService = new WebSocketEvolutionService();

// Desconectar todas as conexões ao encerrar o processo
process.on('beforeExit', () => {
  webSocketEvolutionService.disconnectAll();
});

