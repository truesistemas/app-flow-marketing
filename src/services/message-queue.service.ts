import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import axios from 'axios';

/**
 * Message Queue Service
 * 
 * Gerencia filas de mensagens usando BullMQ para garantir
 * que o sistema não trave com alto volume de disparos simultâneos.
 */
export class MessageQueueService {
  private messageQueue: Queue;
  private mediaQueue: Queue;
  private redisConnection: Redis;

  constructor() {
    // Conexão Redis para BullMQ
    this.redisConnection = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
    });

    // Criar filas
    this.messageQueue = new Queue('whatsapp-messages', {
      connection: this.redisConnection,
    });

    this.mediaQueue = new Queue('whatsapp-media', {
      connection: this.redisConnection,
    });

    // Configurar workers
    this.setupWorkers();
  }

  /**
   * Configura workers para processar as filas
   */
  private setupWorkers(): void {
    // Worker para mensagens de texto
    const messageWorker = new Worker(
      'whatsapp-messages',
      async (job) => {
        const { phone, message, organizationId, apiKey, instanceName, apiUrl } = job.data;
        await this.sendTextMessage(phone, message, organizationId, apiKey, instanceName, apiUrl);
      },
      {
        connection: this.redisConnection,
        concurrency: 10, // Processar até 10 mensagens simultaneamente
        limiter: {
          max: 100, // Máximo de 100 jobs
          duration: 1000, // por segundo
        },
      }
    );

    // Worker para mídias
    const mediaWorker = new Worker(
      'whatsapp-media',
      async (job) => {
        const { phone, mediaType, url, caption, fileName, organizationId, apiKey, instanceName, apiUrl } = job.data;
        await this.sendMediaMessage(phone, mediaType, url, caption, fileName, organizationId, apiKey, instanceName, apiUrl);
      },
      {
        connection: this.redisConnection,
        concurrency: 5, // Processar até 5 mídias simultaneamente
        limiter: {
          max: 50, // Máximo de 50 jobs
          duration: 1000, // por segundo
        },
      }
    );

    // Tratamento de erros
    messageWorker.on('failed', (job, err) => {
      console.error(`Falha ao enviar mensagem ${job?.id}:`, err);
    });

    mediaWorker.on('failed', (job, err) => {
      console.error(`Falha ao enviar mídia ${job?.id}:`, err);
    });
  }

  /**
   * Enfileira mensagem de texto para envio
   */
  async enqueueMessage(data: {
    phone: string;
    message: string;
    organizationId: string;
    apiKey?: string;
    instanceName?: string;
    apiUrl?: string;
  }): Promise<void> {
    await this.messageQueue.add('send-text-message', data, {
      attempts: 3, // Tentar até 3 vezes em caso de falha
      backoff: {
        type: 'exponential',
        delay: 2000, // Delay inicial de 2 segundos
      },
      removeOnComplete: {
        age: 3600, // Remover jobs completos após 1 hora
        count: 1000, // Manter no máximo 1000 jobs completos
      },
      removeOnFail: {
        age: 86400, // Remover jobs falhos após 24 horas
      },
    });
  }

  /**
   * Enfileira mídia para envio
   */
  async enqueueMedia(data: {
    phone: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
    url: string;
    caption?: string;
    fileName?: string;
    organizationId: string;
    apiKey?: string;
    instanceName?: string;
    apiUrl?: string;
  }): Promise<void> {
    await this.mediaQueue.add('send-media', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 86400,
      },
    });
  }

  /**
   * Envia mensagem de texto via Evolution API
   */
  private async sendTextMessage(
    phone: string,
    message: string,
    organizationId: string,
    apiKey?: string,
    instanceName?: string,
    apiUrl?: string
  ): Promise<void> {
    if (!apiKey) {
      throw new Error(`API Key não configurada para organização ${organizationId}`);
    }

    const evolutionApiUrl = apiUrl || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    const instance = instanceName || process.env.EVOLUTION_INSTANCE_NAME || 'default';

    try {
      await axios.post(
        `${evolutionApiUrl}/message/sendText/${instance}`,
        {
          number: phone,
          text: message,
        },
        {
          headers: {
            'apikey': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 segundos de timeout
        }
      );
    } catch (error: any) {
      console.error(`Erro ao enviar mensagem para ${phone}:`, error.message);
      throw error;
    }
  }

  /**
   * Envia mídia via Evolution API
   * Converte URL para Base64 antes de enviar
   */
  private async sendMediaMessage(
    phone: string,
    mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO',
    url: string,
    caption?: string,
    fileName?: string,
    organizationId?: string,
    apiKey?: string,
    instanceName?: string,
    apiUrl?: string
  ): Promise<void> {
    if (!apiKey) {
      throw new Error(`API Key não configurada para organização ${organizationId}`);
    }

    const evolutionApiUrl = apiUrl || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    const instance = instanceName || process.env.EVOLUTION_INSTANCE_NAME || 'default';

    // Converter URL relativa para absoluta se necessário
    let finalUrl = url;
    if (url.startsWith('/uploads/') || (url.startsWith('/') && !url.startsWith('//'))) {
      // URL relativa - converter para absoluta usando a URL base da API
      const apiBaseUrl = process.env.API_URL || 'http://localhost:3000';
      finalUrl = `${apiBaseUrl}${url}`;
      console.log(`[MessageQueue] 🔄 Convertendo URL relativa para absoluta: ${url} -> ${finalUrl}`);
    }

    console.log(`[MessageQueue] 📥 Baixando mídia de: ${finalUrl}`);
    console.log(`[MessageQueue]   - Tipo: ${mediaType}`);
    console.log(`[MessageQueue]   - Telefone: ${phone}`);
    console.log(`[MessageQueue]   - Instância: ${instance}`);

    // Converter URL para Base64
    let mediaBase64: string;
    try {
      const mediaResponse = await axios.get(finalUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'Accept': '*/*',
        },
      });
      mediaBase64 = Buffer.from(mediaResponse.data).toString('base64');
      console.log(`[MessageQueue] ✅ Mídia convertida para Base64 (${Math.round(mediaBase64.length / 1024)}KB)`);
    } catch (error: any) {
      console.error(`[MessageQueue] ❌ Erro ao baixar mídia:`, error.message);
      console.error(`[MessageQueue]   - URL tentada: ${finalUrl}`);
      console.error(`[MessageQueue]   - Status: ${error.response?.status}`);
      console.error(`[MessageQueue]   - Status Text: ${error.response?.statusText}`);
      throw new Error(`Erro ao baixar e converter mídia para Base64: ${error.message}`);
    }

    // Usar a variável mediaBase64 como finalMediaBase64
    const finalMediaBase64 = mediaBase64;

    // Limpar número de telefone (remover caracteres não numéricos)
    const cleanPhone = phone.replace(/\D/g, '');

    // Detectar MIME type correto baseado na URL ou tipo de mídia
    let finalMimeType = 'image/jpeg';
    let mediaTypeForAPI = 'image';

    switch (mediaType) {
      case 'IMAGE':
        // Detectar MIME type baseado na extensão da URL
        if (url.match(/\.(png)$/i)) {
          finalMimeType = 'image/png';
        } else if (url.match(/\.(gif)$/i)) {
          finalMimeType = 'image/gif';
        } else if (url.match(/\.(webp)$/i)) {
          finalMimeType = 'image/webp';
        } else {
          finalMimeType = 'image/jpeg';
        }
        mediaTypeForAPI = 'image';
        break;
      case 'VIDEO':
        if (url.match(/\.(webm)$/i)) {
          finalMimeType = 'video/webm';
        } else {
          finalMimeType = 'video/mp4';
        }
        mediaTypeForAPI = 'video';
        break;
      case 'DOCUMENT':
        if (url.match(/\.(doc|docx)$/i)) {
          finalMimeType = 'application/msword';
        } else if (url.match(/\.(xls|xlsx)$/i)) {
          finalMimeType = 'application/vnd.ms-excel';
        } else {
          finalMimeType = 'application/pdf';
        }
        mediaTypeForAPI = 'document';
        break;
      case 'AUDIO':
        if (url.match(/\.(ogg)$/i)) {
          finalMimeType = 'audio/ogg';
        } else if (url.match(/\.(wav)$/i)) {
          finalMimeType = 'audio/wav';
        } else {
          finalMimeType = 'audio/mp3';
        }
        mediaTypeForAPI = 'audio';
        break;
    }

    let endpoint = '';
    let payload: any = {
      number: cleanPhone,
    };

    if (mediaType === 'AUDIO') {
      // Áudio usa endpoint diferente
      endpoint = `/message/sendWhatsAppAudio/${instance}`;
      payload.audio = finalMediaBase64; // Tentar primeiro Base64 puro
    } else {
      endpoint = `/message/sendMedia/${instance}`;
      payload.mediatype = mediaTypeForAPI;
      payload.mimetype = finalMimeType;
      payload.media = finalMediaBase64; // Tentar primeiro Base64 puro
      if (caption) {
        payload.caption = caption;
      }
      if (mediaType === 'DOCUMENT') {
        // Para documentos, fileName é obrigatório
        // Se não fornecido, extrair da URL
        const extractedFileName = fileName || url.split('/').pop() || 'document.pdf';
        payload.fileName = extractedFileName;
      }
    }

    const headers: Record<string, string> = {
      'apikey': apiKey,
      'Content-Type': 'application/json',
    };

    try {
      console.log(`[MessageQueue] 📤 Enviando mídia para Evolution API:`);
      console.log(`[MessageQueue]   - Endpoint: ${evolutionApiUrl}${endpoint}`);
      console.log(`[MessageQueue]   - Número: ${cleanPhone}`);
      console.log(`[MessageQueue]   - Tipo: ${mediaTypeForAPI}`);
      console.log(`[MessageQueue]   - MIME Type: ${finalMimeType}`);
      console.log(`[MessageQueue]   - Base64 length: ${finalMediaBase64.length} caracteres`);

      // Tentar primeiro com Base64 puro (sem data URI)
      let response = await axios.post(
        `${evolutionApiUrl}${endpoint}`,
        payload,
        {
          headers,
          timeout: 60000,
          validateStatus: (status) => status < 600, // Capturar todos os status para debug
        }
      );

      // Se retornar 400, tentar com data URI
      if (response.status === 400) {
        console.log(`[MessageQueue] ⚠️ Status 400 recebido, tentando com formato data URI...`);
        
        if (mediaType === 'AUDIO') {
          payload.audio = `data:${finalMimeType};base64,${finalMediaBase64}`;
        } else {
          payload.media = `data:${finalMimeType};base64,${finalMediaBase64}`;
        }

        response = await axios.post(
          `${evolutionApiUrl}${endpoint}`,
          payload,
          {
            headers,
            timeout: 60000,
            validateStatus: (status) => status < 600,
          }
        );
      }

      // Verificar se o status é realmente de sucesso
      if (response.status >= 200 && response.status < 300) {
        console.log(`[MessageQueue] ✅ Mídia enviada com sucesso (status ${response.status})`);
      } else {
        const errorMessage = response.data?.message || response.data?.error || `Erro HTTP ${response.status}`;
        console.error(`[MessageQueue] ❌ Erro ao enviar mídia (status ${response.status}):`, errorMessage);
        console.error(`[MessageQueue]   - Resposta completa:`, JSON.stringify(response.data, null, 2));
        throw new Error(`Erro ao enviar mídia: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error(`[MessageQueue] ❌ Erro ao enviar mídia para ${cleanPhone}:`, error.message);
      
      // Log detalhado do erro
      if (error.response) {
        console.error(`[MessageQueue]   - Status: ${error.response.status}`);
        console.error(`[MessageQueue]   - Data:`, JSON.stringify(error.response.data, null, 2));
      }
      
      throw error;
    }
  }

  /**
   * Obtém estatísticas das filas
   */
  async getQueueStats(): Promise<{
    messages: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    media: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  }> {
    const [messageWaiting, messageActive, messageCompleted, messageFailed] = await Promise.all([
      this.messageQueue.getWaitingCount(),
      this.messageQueue.getActiveCount(),
      this.messageQueue.getCompletedCount(),
      this.messageQueue.getFailedCount(),
    ]);

    const [mediaWaiting, mediaActive, mediaCompleted, mediaFailed] = await Promise.all([
      this.mediaQueue.getWaitingCount(),
      this.mediaQueue.getActiveCount(),
      this.mediaQueue.getCompletedCount(),
      this.mediaQueue.getFailedCount(),
    ]);

    return {
      messages: {
        waiting: messageWaiting,
        active: messageActive,
        completed: messageCompleted,
        failed: messageFailed,
      },
      media: {
        waiting: mediaWaiting,
        active: mediaActive,
        completed: mediaCompleted,
        failed: mediaFailed,
      },
    };
  }

  /**
   * Fecha conexões
   */
  async close(): Promise<void> {
    await this.messageQueue.close();
    await this.mediaQueue.close();
    await this.redisConnection.quit();
  }
}


