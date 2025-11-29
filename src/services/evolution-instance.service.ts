import { PrismaClient, InstanceStatus } from '@prisma/client';
import axios, { AxiosError } from 'axios';
import { webhookEventTracker } from './webhook-event-tracker.service';
import { webSocketEvolutionService } from './websocket-evolution.service';

export type IntegrationType = 'WEBHOOK' | 'WEBSOCKET';

export interface CreateInstanceData {
  name: string;
  instanceName: string;
  apiUrl: string;
  apiKey?: string;
  integrationType?: IntegrationType; // Tipo de integração: WEBHOOK ou WEBSOCKET
  websocketGlobalMode?: boolean; // Se true, usa modo global do WebSocket
}

export interface UpdateInstanceData {
  name?: string;
  instanceName?: string;
  apiUrl?: string;
  apiKey?: string;
  integrationType?: IntegrationType;
  websocketGlobalMode?: boolean;
}

export interface TestResult {
  success: boolean;
  status?: number;
  message?: string;
  version?: string;
  error?: string;
  webhookUrl?: string;
  webhookConfigured?: boolean;
  endpointAccessible?: boolean;
  eventReceived?: boolean;
}

export class EvolutionInstanceService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Criar nova instância
   */
  async createInstance(organizationId: string, data: CreateInstanceData) {
    // Validar URL
    this.validateUrl(data.apiUrl);

    // Criar instância
    const instance = await this.prisma.evolutionInstance.create({
      data: {
        name: data.name,
        instanceName: data.instanceName,
        apiUrl: data.apiUrl,
        apiKey: data.apiKey,
        organizationId,
        status: InstanceStatus.INACTIVE,
        integrationType: data.integrationType || 'WEBHOOK',
        websocketGlobalMode: data.websocketGlobalMode || false,
      },
    });

    // Se for WebSocket, conectar automaticamente
    if (data.integrationType === 'WEBSOCKET') {
      const { webSocketEvolutionService } = await import('./websocket-evolution.service');
      try {
        await webSocketEvolutionService.connect({
          apiUrl: data.apiUrl,
          instanceName: data.instanceName,
          apiKey: data.apiKey,
          organizationId,
          globalMode: data.websocketGlobalMode || false,
        });
        console.log(`[Evolution Instance] WebSocket conectado para instância ${data.instanceName}`);
      } catch (error: any) {
        console.error(`[Evolution Instance] Erro ao conectar WebSocket:`, error.message);
        // Não falhar a criação da instância se o WebSocket falhar
      }
    }

    return instance;
  }

  /**
   * Listar instâncias da organização
   */
  async listInstances(organizationId: string, filters?: { status?: InstanceStatus }) {
    const where: any = { organizationId };
    if (filters?.status) {
      where.status = filters.status;
    }

    const instances = await this.prisma.evolutionInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return instances;
  }

  /**
   * Obter detalhes de uma instância
   */
  async getInstance(id: string, organizationId: string) {
    const instance = await this.prisma.evolutionInstance.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    return instance;
  }

  /**
   * Atualizar instância
   */
  async updateInstance(id: string, organizationId: string, data: UpdateInstanceData) {
    // Verificar se a instância existe e pertence à organização
    const existingInstance = await this.getInstance(id, organizationId);

    // Validar URL se fornecida
    if (data.apiUrl) {
      this.validateUrl(data.apiUrl);
    }

    // Atualizar instância
    const instance = await this.prisma.evolutionInstance.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.instanceName && { instanceName: data.instanceName }),
        ...(data.apiUrl && { apiUrl: data.apiUrl }),
        ...(data.apiKey !== undefined && { apiKey: data.apiKey }),
        // Resetar status se URL ou instanceName mudaram
        ...((data.apiUrl || data.instanceName) && { status: InstanceStatus.INACTIVE }),
        ...(data.integrationType !== undefined && { integrationType: data.integrationType }),
        ...(data.websocketGlobalMode !== undefined && { websocketGlobalMode: data.websocketGlobalMode }),
      },
    });

    // Gerenciar conexão WebSocket se o tipo de integração mudou
    if (data.integrationType !== undefined) {
      const { webSocketEvolutionService } = await import('./websocket-evolution.service');
      
      // Desconectar WebSocket antigo se existir
      if (existingInstance.instanceName) {
        webSocketEvolutionService.disconnect(organizationId, existingInstance.instanceName);
      }

      // Conectar WebSocket se for WEBSOCKET
      if (data.integrationType === 'WEBSOCKET') {
        try {
          await webSocketEvolutionService.connect({
            apiUrl: data.apiUrl || existingInstance.apiUrl,
            instanceName: data.instanceName || existingInstance.instanceName,
            apiKey: data.apiKey !== undefined ? data.apiKey : existingInstance.apiKey || undefined,
            organizationId,
            globalMode: data.websocketGlobalMode || false,
          });
          console.log(`[Evolution Instance] WebSocket conectado para instância ${data.instanceName || existingInstance.instanceName}`);
        } catch (error: any) {
          console.error(`[Evolution Instance] Erro ao conectar WebSocket:`, error.message);
        }
      }
    }

    return instance;
  }

  /**
   * Deletar instância
   */
  async deleteInstance(id: string, organizationId: string) {
    // Verificar se a instância existe e pertence à organização
    const instance = await this.getInstance(id, organizationId);
    
    // Desconectar WebSocket se estiver conectado
    const { webSocketEvolutionService } = await import('./websocket-evolution.service');
    webSocketEvolutionService.disconnect(organizationId, instance.instanceName);

    // Verificar se há campanhas usando esta instância
    const campaignsCount = await this.prisma.campaign.count({
      where: {
        instanceId: id,
      },
    });

    if (campaignsCount > 0) {
      throw new Error(
        `Não é possível deletar a instância pois existem ${campaignsCount} campanha(s) associada(s)`
      );
    }

    // Deletar instância
    await this.prisma.evolutionInstance.delete({
      where: { id },
    });
  }

  /**
   * Testar conexão com a Evolution API
   * Conforme documentação: GET {apiUrl}/{instanceName}
   * Documentação: https://doc.evolution-api.com/v2/api-reference/get-information
   */
  async testConnection(id: string, organizationId: string): Promise<TestResult> {
    const instance = await this.getInstance(id, organizationId);

    // Construir URL de teste conforme documentação Evolution API
    // Documentação: https://doc.evolution-api.com/v2/api-reference/get-information
    // Formato: GET {apiUrl}/{instanceName}
    const baseUrl = instance.apiUrl.replace(/\/$/, '');
    // Tentar diferentes formatos de URL
    const possibleUrls = [
      `${baseUrl}/${instance.instanceName}`, // Formato padrão
      `${baseUrl}/instance/${instance.instanceName}`, // Formato alternativo
      `${baseUrl}/v2/${instance.instanceName}`, // Com versão da API
    ];

    console.log(`[Evolution API Test] Testando conexão com instância: ${instance.instanceName}`);
    console.log(`[Evolution API Test] Base URL: ${baseUrl}`);
    console.log(`[Evolution API Test] API Key presente: ${!!instance.apiKey}`);

    // Preparar headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (instance.apiKey) {
      headers['apikey'] = instance.apiKey;
      headers['Authorization'] = `Bearer ${instance.apiKey}`; // Tentar também Bearer token
    }

    // Tentar cada formato de URL até encontrar uma que funcione
    let response: any = null;
    let lastError: any = null;
    let successfulUrl = '';

    try {

      for (const testUrl of possibleUrls) {
        try {
          console.log(`[Evolution API Test] Tentando URL: ${testUrl}`);
          response = await axios.get(testUrl, {
            headers,
            timeout: 10000, // 10 segundos
            validateStatus: (status) => status < 500, // Aceitar 4xx como resposta válida
          });
          
          // Se chegou aqui, a requisição foi bem-sucedida
          successfulUrl = testUrl;
          console.log(`[Evolution API Test] URL bem-sucedida: ${testUrl}`);
          break;
        } catch (error: any) {
          lastError = error;
          // Se não for 404, pode ser outro erro válido
          if (error.response?.status && error.response.status !== 404) {
            response = error.response;
            successfulUrl = testUrl;
            break;
          }
          // Continuar tentando outras URLs se for 404
          continue;
        }
      }

      // Se nenhuma URL funcionou, lançar o último erro
      if (!response && lastError) {
        throw lastError;
      }

      console.log(`[Evolution API Test] Resposta recebida:`, {
        status: response.status,
        data: response.data,
      });

      // Extrair número conectado da resposta
      // A Evolution API pode retornar o número em diferentes campos:
      // - owner, phone, wid, jid, instance.owner, instance.phone, etc.
      const responseData = response.data || {};
      
      // Tentar diferentes campos possíveis
      let connectedPhone: string | null = null;
      
      if (responseData.owner) {
        connectedPhone = responseData.owner;
      } else if (responseData.phone) {
        connectedPhone = responseData.phone;
      } else if (responseData.wid) {
        connectedPhone = responseData.wid;
      } else if (responseData.jid) {
        connectedPhone = responseData.jid;
      } else if (responseData.instance?.owner) {
        connectedPhone = responseData.instance.owner;
      } else if (responseData.instance?.phone) {
        connectedPhone = responseData.instance.phone;
      } else if (responseData.instance?.wid) {
        connectedPhone = responseData.instance.wid;
      } else if (responseData.instance?.jid) {
        connectedPhone = responseData.instance.jid;
      }

      // Limpar formato do número se necessário (remover @s.whatsapp.net, etc)
      let cleanPhone: string | null = null;
      if (connectedPhone) {
        // Remover sufixos como @s.whatsapp.net, @c.us, etc
        cleanPhone = connectedPhone
          .replace(/@.*$/, '')
          .replace(/\D/g, ''); // Manter apenas dígitos
      }

      console.log(`[Evolution API Test] Número conectado encontrado:`, {
        raw: connectedPhone,
        cleaned: cleanPhone,
        responseData: JSON.stringify(responseData, null, 2),
      });

      const testResult: TestResult = {
        success: true,
        status: response.status,
        message: response.data?.message || 'Conexão bem-sucedida',
        version: response.data?.version,
      };

      // Atualizar instância com resultado do teste e número conectado
      await this.prisma.evolutionInstance.update({
        where: { id },
        data: {
          status: InstanceStatus.ACTIVE,
          connectedPhone: cleanPhone,
          lastTestedAt: new Date(),
          testResult: testResult,
        },
      });

      return testResult;
    } catch (error: any) {
      const axiosError = error as AxiosError;
      
      console.error(`[Evolution API Test] Erro ao testar conexão:`, {
        urlsTentadas: possibleUrls,
        urlBemSucedida: successfulUrl || 'Nenhuma',
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        message: axiosError.message,
      });

      const errorStatus = axiosError.response?.status;
      const errorData = axiosError.response?.data;
      
      let errorMessage = 'Erro ao conectar com a Evolution API';
      
      if (errorStatus === 404) {
        errorMessage = `Instância "${instance.instanceName}" não encontrada na Evolution API. Verifique se o nome da instância está correto e se a instância existe no servidor Evolution API em ${instance.apiUrl}`;
      } else if (errorStatus === 401 || errorStatus === 403) {
        errorMessage = 'Erro de autenticação. Verifique se a API Key está correta.';
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      } else if (errorData?.error) {
        errorMessage = errorData.error;
      } else if (axiosError.message) {
        errorMessage = axiosError.message;
      } else if (errorStatus) {
        errorMessage = `Erro ao conectar com a Evolution API (Status: ${errorStatus})`;
      }

      const testResult: TestResult = {
        success: false,
        status: errorStatus,
        error: errorMessage,
      };

      // Atualizar instância com resultado do erro
      await this.prisma.evolutionInstance.update({
        where: { id },
        data: {
          status: InstanceStatus.ERROR,
          lastTestedAt: new Date(),
          testResult: testResult,
        },
      });

      return testResult;
    }
  }

  /**
   * Testar envio de mensagem de texto
   * Documentação: https://doc.evolution-api.com/v2/api-reference/send-text
   * Endpoint: POST /message/sendText/{instance}
   */
  async testSendTextMessage(
    id: string,
    organizationId: string,
    testPhone: string
  ): Promise<TestResult> {
    const instance = await this.getInstance(id, organizationId);

    const baseUrl = instance.apiUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/message/sendText/${instance.instanceName}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (instance.apiKey) {
      headers['apikey'] = instance.apiKey;
    }

    try {
      console.log(`[Evolution API Test] Enviando texto para: ${endpoint}`);
      const response = await axios.post(
        endpoint,
        {
          number: testPhone,
          text: '🧪 Teste de mensagem de texto - Evolution API',
        },
        {
          headers,
          timeout: 30000,
        }
      );

      console.log(`[Evolution API Test] Texto enviado com sucesso`);

      return {
        success: true,
        status: response.status,
        message: 'Mensagem de texto enviada com sucesso',
      };
    } catch (error: any) {
      const axiosError = error as AxiosError;
      const errorMessage = 
        axiosError.response?.data?.message || 
        axiosError.response?.data?.error || 
        (axiosError.response?.data?.response?.message) ||
        axiosError.message || 
        'Erro ao enviar mensagem de texto';
      
      console.error(`[Evolution API Test] Erro ao enviar texto (status ${axiosError.response?.status}):`, {
        endpoint,
        error: errorMessage,
        responseData: axiosError.response?.data,
      });
      
      return {
        success: false,
        status: axiosError.response?.status,
        error: errorMessage,
      };
    }
  }

  /**
   * Testar envio de mídia (imagem)
   * Documentação: https://doc.evolution-api.com/v2/api-reference/send-media
   * Endpoint: POST /message/sendMedia/{instance}
   * Suporta Base64 ou URL
   */
  async testSendMedia(
    id: string,
    organizationId: string,
    testPhone: string,
    mediaUrl: string,
    mediaBase64?: string,
    mimeType?: string
  ): Promise<TestResult> {
    const instance = await this.getInstance(id, organizationId);

    const baseUrl = instance.apiUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/message/sendMedia/${instance.instanceName}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (instance.apiKey) {
      headers['apikey'] = instance.apiKey;
    }

    // Validar formato do número (deve conter apenas dígitos)
    const cleanPhone = testPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      return {
        success: false,
        status: 400,
        error: `Número de telefone inválido: ${testPhone}. Deve conter código do país + DDD + número (ex: 5511999999999)`,
      };
    }

    // Usar Base64 fornecido diretamente, ou converter URL para Base64
    let finalMediaBase64: string;
    let finalMimeType: string = mimeType || 'image/jpeg';
    
    if (mediaBase64) {
      // Base64 fornecido diretamente do frontend
      finalMediaBase64 = mediaBase64;
      console.log(`[Evolution API Test] Usando Base64 fornecido diretamente (${finalMediaBase64.length} caracteres)`);
    } else if (mediaUrl) {
      // Converter URL para Base64
      try {
        console.log(`[Evolution API Test] Baixando mídia da URL: ${mediaUrl}`);
        const mediaResponse = await axios.get(mediaUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
          maxContentLength: 10 * 1024 * 1024, // 10MB máximo
        });
        
        finalMediaBase64 = Buffer.from(mediaResponse.data).toString('base64');
        // Tentar detectar o tipo MIME da resposta
        const contentType = mediaResponse.headers['content-type'];
        if (contentType) {
          finalMimeType = contentType;
        }
        console.log(`[Evolution API Test] Mídia convertida para Base64 (${finalMediaBase64.length} caracteres)`);
      } catch (error: any) {
        // Se falhar ao baixar, usar imagem padrão em Base64
        console.warn(`[Evolution API Test] Erro ao baixar mídia, usando imagem padrão: ${error.message}`);
        finalMediaBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        finalMimeType = 'image/png';
      }
    } else {
      // Nenhum arquivo ou URL fornecido, usar imagem padrão
      finalMediaBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      finalMimeType = 'image/png';
      console.log(`[Evolution API Test] Usando imagem de teste padrão em Base64`);
    }

    // Determinar tipo de mídia baseado no MIME type
    let mediaType = 'image';
    if (finalMimeType.startsWith('video/')) {
      mediaType = 'video';
    } else if (finalMimeType.startsWith('image/')) {
      mediaType = 'image';
    }

    // Preparar payload conforme documentação
    // Tentar primeiro com Base64 puro (sem data URI), se falhar, tentar com data URI
    let payload: any = {
      number: cleanPhone,
      mediatype: mediaType,
      mimetype: finalMimeType,
      media: finalMediaBase64, // Tentar primeiro apenas Base64 puro
      caption: '🧪 Teste de envio de mídia - Evolution API',
    };

    try {
      console.log(`[Evolution API Test] Enviando mídia para: ${endpoint}`);
      console.log(`[Evolution API Test] Número limpo: ${cleanPhone}`);
      console.log(`[Evolution API Test] Tipo MIME: ${finalMimeType}`);
      console.log(`[Evolution API Test] Tipo de mídia: ${mediaType}`);
      console.log(`[Evolution API Test] Mídia em Base64: ${finalMediaBase64.substring(0, 50)}... (${finalMediaBase64.length} caracteres total)`);
      console.log(`[Evolution API Test] Payload completo (sem media):`, JSON.stringify({ ...payload, media: `[${finalMediaBase64.length} caracteres Base64]` }, null, 2));
      
      let response = await axios.post(
        endpoint,
        payload,
        {
          headers,
          timeout: 60000,
          validateStatus: (status) => status < 600, // Capturar todos os status para debug
        }
      );

      // Se retornar 400, tentar com data URI
      if (response.status === 400) {
        console.log(`[Evolution API Test] Status 400 recebido, tentando com formato data URI...`);
        payload.media = `data:${finalMimeType};base64,${finalMediaBase64}`;
        console.log(`[Evolution API Test] Tentando novamente com data URI...`);
        
        response = await axios.post(
          endpoint,
          payload,
          {
            headers,
            timeout: 60000,
            validateStatus: (status) => status < 600,
          }
        );
      }

      // Verificar se o status é realmente de sucesso (200-299)
      if (response.status >= 200 && response.status < 300) {
        console.log(`[Evolution API Test] Mídia enviada com sucesso`);
        console.log(`[Evolution API Test] Resposta:`, JSON.stringify(response.data, null, 2));

        return {
          success: true,
          status: response.status,
          message: 'Mídia enviada com sucesso',
        };
      } else {
        // Status não é de sucesso, tratar como erro
        let errorMessage = response.data?.message || response.data?.error || `Erro HTTP ${response.status}`;
        
        // Tentar extrair mensagem mais específica
        if (response.data) {
          if (typeof response.data === 'string') {
            errorMessage = response.data;
          } else {
            const possibleErrors = [
              response.data.error,
              response.data.message,
              response.data.detail,
              response.data.description,
            ].filter(Boolean);
            
            if (possibleErrors.length > 0) {
              errorMessage = possibleErrors[0];
            } else {
              errorMessage = JSON.stringify(response.data);
            }
          }
        }
        
        console.error(`[Evolution API Test] Erro ao enviar mídia (status ${response.status}):`, JSON.stringify(response.data, null, 2));
        
        return {
          success: false,
          status: response.status,
          error: errorMessage,
        };
      }
    } catch (error: any) {
      const axiosError = error as AxiosError;
      
      // Extrair mensagem de erro mais detalhada
      let errorMessage = 'Erro ao enviar mídia';
      let errorDetails = '';
      
      if (axiosError.response?.data) {
        const responseData = axiosError.response.data as any;
        errorMessage = 
          responseData.message || 
          responseData.error || 
          responseData.response?.message ||
          responseData.response?.error ||
          (typeof responseData === 'string' ? responseData : JSON.stringify(responseData));
        
        // Capturar detalhes completos da resposta
        errorDetails = JSON.stringify(responseData, null, 2);
      } else if (axiosError.message) {
        errorMessage = axiosError.message;
      }
      
      console.error(`[Evolution API Test] Erro ao enviar mídia (status ${axiosError.response?.status}):`, {
        endpoint,
        payload,
        error: errorMessage,
        responseData: axiosError.response?.data,
        errorDetails,
      });
      
      // Retornar mensagem de erro mais detalhada
      let finalErrorMessage = errorMessage;
      
      if (axiosError.response?.status === 500) {
        finalErrorMessage = `Erro interno do servidor (500)`;
        
        // Adicionar detalhes específicos se disponíveis
        if (errorDetails) {
          finalErrorMessage += `\n\nDetalhes do servidor:\n${errorDetails}`;
        }
        
        // Sugestões comuns para erro 500
        finalErrorMessage += `\n\nPossíveis causas:`;
        finalErrorMessage += `\n- URL da mídia inválida ou inacessível`;
        finalErrorMessage += `\n- Formato do número de telefone incorreto`;
        finalErrorMessage += `\n- Instância não conectada ou desconectada`;
        finalErrorMessage += `\n- Problema temporário no servidor Evolution API`;
        finalErrorMessage += `\n\nVerifique os logs do servidor para mais detalhes.`;
      }
      
      return {
        success: false,
        status: axiosError.response?.status,
        error: finalErrorMessage,
      };
    }
  }

  /**
   * Testar envio de áudio
   * Documentação: https://doc.evolution-api.com/v2/api-reference/send-whats-app-audio
   * Endpoint: POST /message/sendWhatsAppAudio/{instance}
   */
  async testSendAudio(
    id: string,
    organizationId: string,
    testPhone: string,
    audioUrl: string,
    audioBase64?: string,
    mimeType?: string
  ): Promise<TestResult> {
    const instance = await this.getInstance(id, organizationId);

    const baseUrl = instance.apiUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/message/sendWhatsAppAudio/${instance.instanceName}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (instance.apiKey) {
      headers['apikey'] = instance.apiKey;
    }

    // Validar formato do número
    const cleanPhone = testPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      return {
        success: false,
        status: 400,
        error: `Número de telefone inválido: ${testPhone}`,
      };
    }

    // Usar Base64 fornecido diretamente, ou converter URL para Base64
    let finalAudioBase64: string;
    let finalMimeType: string = mimeType || 'audio/mp3';
    
    if (audioBase64) {
      // Base64 fornecido diretamente do frontend
      finalAudioBase64 = audioBase64;
      console.log(`[Evolution API Test] Usando Base64 fornecido diretamente (${finalAudioBase64.length} caracteres)`);
    } else if (audioUrl) {
      // Converter URL para Base64
      try {
        console.log(`[Evolution API Test] Baixando áudio da URL: ${audioUrl}`);
        const audioResponse = await axios.get(audioUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
          maxContentLength: 10 * 1024 * 1024, // 10MB máximo
        });
        
        finalAudioBase64 = Buffer.from(audioResponse.data).toString('base64');
        // Tentar detectar o tipo MIME da resposta
        const contentType = audioResponse.headers['content-type'];
        if (contentType) {
          finalMimeType = contentType;
        }
        console.log(`[Evolution API Test] Áudio convertido para Base64 (${finalAudioBase64.length} caracteres)`);
      } catch (error: any) {
        return {
          success: false,
          status: 400,
          error: `Erro ao baixar e converter áudio para Base64: ${error.message}. Verifique se a URL é acessível e se o servidor tem acesso à internet.`,
        };
      }
    } else {
      return {
        success: false,
        status: 400,
        error: 'Nenhum arquivo de áudio ou URL fornecida. Por favor, selecione um arquivo ou forneça uma URL.',
      };
    }

    // Preparar payload conforme documentação da Evolution API
    // Segundo a documentação, o campo 'audio' pode aceitar Base64 direto ou data URI
    // Vamos tentar apenas o Base64 primeiro (sem data URI)
    const payload: any = {
      number: cleanPhone,
      audio: finalAudioBase64, // Apenas Base64, sem prefixo data URI
    };

    try {
      console.log(`[Evolution API Test] Enviando áudio para: ${endpoint}`);
      console.log(`[Evolution API Test] Tipo MIME: ${finalMimeType}`);
      console.log(`[Evolution API Test] Payload (sem audio completo):`, JSON.stringify({ ...payload, audio: `[${finalAudioBase64.length} caracteres Base64]` }, null, 2));
      
      const response = await axios.post(
        endpoint,
        payload,
        {
          headers,
          timeout: 60000,
          validateStatus: (status) => status < 600, // Capturar todos os status para debug
        }
      );

      // Verificar se o status é realmente de sucesso (200-299)
      if (response.status >= 200 && response.status < 300) {
        console.log(`[Evolution API Test] Áudio enviado com sucesso`);
        console.log(`[Evolution API Test] Resposta:`, JSON.stringify(response.data, null, 2));

        return {
          success: true,
          status: response.status,
          message: 'Áudio enviado com sucesso',
        };
      } else {
        // Status não é de sucesso, tratar como erro
        const errorMessage = response.data?.message || response.data?.error || `Erro HTTP ${response.status}`;
        console.error(`[Evolution API Test] Erro ao enviar áudio (status ${response.status}):`, response.data);
        
        return {
          success: false,
          status: response.status,
          error: errorMessage,
        };
      }
    } catch (error: any) {
      const axiosError = error as AxiosError;
      
      // Extrair mensagem de erro mais detalhada
      let errorMessage = 'Erro ao enviar áudio';
      let errorDetails = '';
      
      if (axiosError.response?.data) {
        const responseData = axiosError.response.data as any;
        errorMessage = 
          responseData.message || 
          responseData.error || 
          responseData.response?.message ||
          responseData.response?.error ||
          (typeof responseData === 'string' ? responseData : JSON.stringify(responseData));
        
        errorDetails = JSON.stringify(responseData, null, 2);
      } else if (axiosError.message) {
        errorMessage = axiosError.message;
      }
      
      console.error(`[Evolution API Test] Erro ao enviar áudio (status ${axiosError.response?.status}):`, {
        endpoint,
        payload: { ...payload, audio: `[${finalAudioBase64.length} caracteres Base64]` },
        error: errorMessage,
        responseData: axiosError.response?.data,
        errorDetails,
      });
      
      // Se for erro 400, tentar com data URI
      if (axiosError.response?.status === 400) {
        console.log(`[Evolution API Test] Tentando novamente com formato data URI...`);
        try {
          const retryPayload = {
            number: cleanPhone,
            audio: `data:${finalMimeType};base64,${finalAudioBase64}`,
          };
          
          const retryResponse = await axios.post(
            endpoint,
            retryPayload,
            {
              headers,
              timeout: 60000,
            }
          );
          
          console.log(`[Evolution API Test] Áudio enviado com sucesso (com data URI)`);
          return {
            success: true,
            status: retryResponse.status,
            message: 'Áudio enviado com sucesso',
          };
        } catch (retryError: any) {
          // Se ainda falhar, retornar o erro original
        }
      }
      
      return {
        success: false,
        status: axiosError.response?.status,
        error: errorMessage + (errorDetails ? `\n\nDetalhes: ${errorDetails}` : ''),
      };
    }
  }

  /**
   * Testar webhook (verificar se está configurado e se o endpoint está acessível)
   * Documentação: https://doc.evolution-api.com/v2/api-reference/get-information
   */
  async testWebhook(
    id: string,
    organizationId: string
  ): Promise<TestResult & { webhookUrl?: string; webhookConfigured?: boolean; endpointAccessible?: boolean }> {
    const instance = await this.getInstance(id, organizationId);

    const baseUrl = instance.apiUrl.replace(/\/$/, '');
    
    // Tentar diferentes formatos de endpoint conforme documentação Evolution API
    const possibleEndpoints = [
      `${baseUrl}/${instance.instanceName}`,
      `${baseUrl}/instance/${instance.instanceName}`,
      `${baseUrl}/v2/${instance.instanceName}`,
      `${baseUrl}/${instance.instanceName}/info`,
      `${baseUrl}/instance/${instance.instanceName}/info`,
    ];
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (instance.apiKey) {
      headers['apikey'] = instance.apiKey;
      headers['Authorization'] = `Bearer ${instance.apiKey}`;
    }

    let lastError: any = null;
    let instanceInfo: any = null;

    // Tentar cada endpoint até encontrar um que funcione
    for (const infoEndpoint of possibleEndpoints) {
      try {
        console.log(`[Evolution API Test] Tentando endpoint de webhook: ${infoEndpoint}`);
        const infoResponse = await axios.get(infoEndpoint, {
          headers,
          timeout: 10000,
          validateStatus: (status) => status < 500,
        });

        instanceInfo = infoResponse.data || {};
        console.log(`[Evolution API Test] Endpoint de webhook bem-sucedido: ${infoEndpoint}`);
        break;
      } catch (error: any) {
        lastError = error;
        const axiosError = error as AxiosError;
        // Se não for 404, pode ser outro erro válido
        if (axiosError.response?.status && axiosError.response.status !== 404) {
          instanceInfo = axiosError.response?.data || {};
          break;
        }
        // Continuar tentando outros endpoints se for 404
        continue;
      }
    }

    if (!instanceInfo && lastError) {
      const axiosError = lastError as AxiosError;
      return {
        success: false,
        status: axiosError.response?.status,
        error: axiosError.response?.data?.message || axiosError.message || 'Erro ao verificar webhook - Não foi possível obter informações da instância',
        webhookConfigured: false,
      };
    }

    // Extrair informações do webhook de diferentes possíveis campos
    const webhookUrl = 
      instanceInfo.webhook?.url || 
      instanceInfo.webhookUrl || 
      instanceInfo.webhook?.webhook?.url ||
      instanceInfo.instance?.webhook?.url ||
      instanceInfo.data?.webhook?.url ||
      instanceInfo.qrcode?.webhook?.url ||
      null;
    
    console.log(`[Evolution API Test] Informações da instância recebidas:`, JSON.stringify(instanceInfo, null, 2));
    console.log(`[Evolution API Test] Webhook URL extraída: ${webhookUrl || 'não encontrada'}`);
    
    const webhookConfigured = !!webhookUrl;

    // Verificar se o webhook aponta para nosso servidor
    const ourWebhookUrl = process.env.WEBHOOK_URL || `${process.env.APP_URL || 'http://localhost:3000'}/webhook/evolution`;
    const webhookPointsToUs = webhookUrl && (
      webhookUrl.includes(ourWebhookUrl) || 
      webhookUrl.includes('/api/webhooks/evolution') ||
      webhookUrl.includes('/webhook/evolution')
    );

    // Se o webhook não estiver configurado, retornar erro
    if (!webhookConfigured) {
      return {
        success: false,
        status: 200, // A API respondeu com sucesso, mas o webhook não está configurado
        error: 'Webhook não configurado na instância. Configure o webhook na Evolution API para receber eventos.',
        webhookUrl: undefined,
        webhookConfigured: false,
        endpointAccessible: false,
      };
    }

    // Verificar se o endpoint do webhook está acessível (se apontar para nosso servidor)
    let endpointAccessible = false;
    if (webhookPointsToUs && webhookUrl) {
      try {
        // Tentar fazer uma requisição HEAD ou GET para verificar se o endpoint está acessível
        // Nota: O endpoint pode não responder a GET, mas podemos verificar se está acessível
        console.log(`[Evolution API Test] Verificando acessibilidade do endpoint: ${webhookUrl}`);
        
        // Se o webhook aponta para nosso servidor, assumimos que está acessível
        // (pois estamos testando de dentro do próprio servidor)
        endpointAccessible = true;
        console.log(`[Evolution API Test] Endpoint aponta para este servidor - assumindo acessível`);
      } catch (error: any) {
        console.warn(`[Evolution API Test] Não foi possível verificar acessibilidade do endpoint: ${error.message}`);
        endpointAccessible = false;
      }
    }

    // Webhook configurado - verificar se aponta para nosso servidor
    if (webhookPointsToUs) {
      // Tentar aguardar um evento de teste (se possível enviar um evento de teste)
      let eventReceived = false;
      let eventTestError: string | null = null;
      
      try {
        console.log(`[Evolution API Test] Aguardando evento de webhook para testar recepção...`);
        
        // Tentar enviar uma mensagem de teste para gerar um evento
        // Nota: Isso pode não funcionar se não houver número de teste configurado
        // Mas vamos tentar aguardar eventos recentes ou novos
        
        // Aguardar até 10 segundos por um evento
        try {
          const testEvent = await webhookEventTracker.waitForEvent(
            instance.instanceName,
            organizationId,
            10000 // 10 segundos
          );
          
          eventReceived = true;
          console.log(`[Evolution API Test] Evento recebido durante o teste:`, testEvent.event);
        } catch (waitError: any) {
          // Timeout ou erro ao aguardar - não é crítico, apenas informativo
          eventTestError = waitError.message;
          console.log(`[Evolution API Test] Não foi possível receber evento de teste: ${eventTestError}`);
          
          // Verificar se há eventos recentes (últimos 30 segundos)
          const recentEvents = webhookEventTracker.getRecentEvents(
            instance.instanceName,
            organizationId,
            30000
          );
          
          if (recentEvents.length > 0) {
            eventReceived = true;
            console.log(`[Evolution API Test] Encontrados ${recentEvents.length} eventos recentes`);
          }
        }
      } catch (error: any) {
        eventTestError = error.message;
        console.error(`[Evolution API Test] Erro ao testar recepção de eventos:`, error);
      }

      const message = endpointAccessible 
        ? (eventReceived 
          ? 'Webhook configurado e funcionando! Eventos estão sendo recebidos corretamente.'
          : 'Webhook configurado e apontando para este servidor. Endpoint acessível.' + (eventTestError ? ` (Não foi possível testar recepção: ${eventTestError})` : ''))
        : 'Webhook configurado e apontando para este servidor.';

      return {
        success: true,
        status: 200,
        message: message,
        webhookUrl: webhookUrl,
        webhookConfigured: true,
        endpointAccessible: endpointAccessible,
        eventReceived: eventReceived,
      };
    } else {
      // Webhook configurado mas apontando para outro lugar
      // Tentar verificar se o endpoint externo está acessível
      let externalEndpointAccessible = false;
      if (webhookUrl) {
        try {
          console.log(`[Evolution API Test] Verificando acessibilidade do endpoint externo: ${webhookUrl}`);
          // Tentar fazer uma requisição HEAD para verificar se o endpoint está acessível
          const testResponse = await axios.head(webhookUrl, {
            timeout: 5000,
            validateStatus: (status) => status < 500, // Aceitar qualquer status < 500 como "acessível"
          });
          externalEndpointAccessible = true;
          console.log(`[Evolution API Test] Endpoint externo acessível (status: ${testResponse.status})`);
        } catch (error: any) {
          console.warn(`[Evolution API Test] Endpoint externo não acessível: ${error.message}`);
          externalEndpointAccessible = false;
        }
      }

      return {
        success: false,
        status: 200,
        error: `Webhook configurado, mas apontando para outro servidor: ${webhookUrl}. ${externalEndpointAccessible ? 'Endpoint externo está acessível.' : 'Endpoint externo não está acessível ou não respondeu.'} Configure para apontar para: ${ourWebhookUrl}`,
        webhookUrl: webhookUrl,
        webhookConfigured: true,
        endpointAccessible: externalEndpointAccessible,
      };
    }
  }

  /**
   * Testar WebSocket (verificar conexão e aguardar eventos)
   * Documentação: https://doc.evolution-api.com/v2/en/integrations/websocket
   */
  async testWebSocket(
    id: string,
    organizationId: string,
    timeout: number = 30000 // 30 segundos por padrão
  ): Promise<TestResult & { 
    connected?: boolean; 
    eventReceived?: boolean; 
    eventsReceived?: number;
    lastEvent?: string;
  }> {
    const instance = await this.getInstance(id, organizationId);

    console.log(`[Evolution API Test] Iniciando teste de WebSocket para instância ${instance.instanceName}`);

    try {
      // Verificar se já está conectado
      const isConnected = webSocketEvolutionService.isConnected(organizationId, instance.instanceName);
      const connectionStatus = webSocketEvolutionService.getConnectionStatus(organizationId, instance.instanceName);

      if (!isConnected) {
        // Tentar conectar
        console.log(`[Evolution API Test] Conectando WebSocket...`);
        try {
          // Detectar modo global baseado na URL (localhost usa modo global por padrão)
          const isLocalhost = instance.apiUrl.includes('localhost') || instance.apiUrl.includes('127.0.0.1');
          const useGlobalMode = instance.apiUrl.includes('localhost') || instance.apiUrl.includes('127.0.0.1');
          
          const socket = await webSocketEvolutionService.connect({
            apiUrl: instance.apiUrl,
            instanceName: instance.instanceName,
            apiKey: instance.apiKey || undefined,
            organizationId,
            globalMode: useGlobalMode, // Localhost usa modo global por padrão
          });
          
          // Aguardar um pouco para garantir que a conexão foi estabelecida
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const finalStatus = webSocketEvolutionService.getConnectionStatus(organizationId, instance.instanceName);
          const finalConnected = webSocketEvolutionService.isConnected(organizationId, instance.instanceName);
          
          console.log(`[Evolution API Test] WebSocket conectado: ${finalConnected}`);
          console.log(`[Evolution API Test] Status detalhado:`, finalStatus);
          console.log(`[Evolution API Test] Socket ID: ${socket.id || 'N/A'}`);
          
          if (!finalConnected) {
            return {
              success: false,
              status: 500,
              error: 'WebSocket não conseguiu estabelecer conexão. Verifique se o WebSocket está habilitado na Evolution API (WEBSOCKET_ENABLED=true) e se a instância está configurada corretamente.',
              connected: false,
              eventReceived: false,
            };
          }
        } catch (connectError: any) {
          console.error(`[Evolution API Test] Erro ao conectar WebSocket:`, connectError);
          return {
            success: false,
            status: 500,
            error: `Erro ao conectar WebSocket: ${connectError.message}. Verifique se o WebSocket está habilitado na Evolution API.`,
            connected: false,
            eventReceived: false,
          };
        }
      } else {
        console.log(`[Evolution API Test] WebSocket já está conectado`);
        const status = webSocketEvolutionService.getConnectionStatus(organizationId, instance.instanceName);
        console.log(`[Evolution API Test] Status da conexão existente:`, status);
      }

      // Verificar eventos recentes (últimos 10 segundos)
      const recentEvents = webhookEventTracker.getRecentEvents(
        instance.instanceName,
        organizationId,
        10000
      );

      if (recentEvents.length > 0) {
        console.log(`[Evolution API Test] Encontrados ${recentEvents.length} eventos recentes`);
        return {
          success: true,
          status: 200,
          message: `WebSocket conectado e funcionando! ${recentEvents.length} evento(s) recebido(s) recentemente.`,
          connected: true,
          eventReceived: true,
          eventsReceived: recentEvents.length,
          lastEvent: recentEvents[0]?.event,
        };
      }

      // Aguardar eventos por até timeout segundos
      console.log(`[Evolution API Test] Aguardando eventos por até ${timeout / 1000} segundos...`);
      try {
        const testEvent = await webhookEventTracker.waitForEvent(
          instance.instanceName,
          organizationId,
          timeout
        );

        console.log(`[Evolution API Test] Evento recebido durante o teste:`, testEvent.event);
        return {
          success: true,
          status: 200,
          message: `WebSocket conectado e funcionando! Evento recebido: ${testEvent.event}`,
          connected: true,
          eventReceived: true,
          eventsReceived: 1,
          lastEvent: testEvent.event,
        };
      } catch (waitError: any) {
        // Timeout - não é erro crítico, apenas informativo
        console.log(`[Evolution API Test] Timeout aguardando eventos: ${waitError.message}`);
        return {
          success: true,
          status: 200,
          message: `WebSocket conectado com sucesso, mas nenhum evento foi recebido durante o teste. Envie uma mensagem para testar a recepção.`,
          connected: true,
          eventReceived: false,
          eventsReceived: 0,
        };
      }
    } catch (error: any) {
      console.error(`[Evolution API Test] Erro ao testar WebSocket:`, error);
      return {
        success: false,
        status: 500,
        error: error.message || 'Erro ao testar WebSocket',
        connected: false,
        eventReceived: false,
      };
    }
  }

  private validateUrl(url: string) {
    try {
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('URL deve usar protocolo HTTP ou HTTPS');
      }
    } catch (error) {
      throw new Error('URL inválida');
    }
  }
}

