import axios from 'axios';
import { PrismaClient } from '@prisma/client';

/**
 * AI Service
 * 
 * Gerencia chamadas para diferentes provedores de LLM (OpenAI, Gemini, Anthropic)
 */
export class AIService {
  constructor(private prisma?: PrismaClient) {}

  /**
   * Busca chave API do banco de dados ou variável de ambiente
   */
  private async getApiKey(
    provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC',
    organizationId?: string
  ): Promise<string> {
    // Se organizationId fornecido, buscar do banco
    if (organizationId && this.prisma) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          openaiApiKey: true,
          geminiApiKey: true,
          anthropicApiKey: true,
        },
      });

      if (organization) {
        let apiKey: string | null = null;
        switch (provider) {
          case 'OPENAI':
            apiKey = organization.openaiApiKey;
            break;
          case 'GEMINI':
            apiKey = organization.geminiApiKey;
            break;
          case 'ANTHROPIC':
            apiKey = organization.anthropicApiKey;
            break;
        }

        if (apiKey) {
          return apiKey;
        }
      }
    }

    // Fallback para variáveis de ambiente
    const envKey = provider === 'OPENAI' 
      ? process.env.OPENAI_API_KEY
      : provider === 'GEMINI'
      ? process.env.GEMINI_API_KEY
      : process.env.ANTHROPIC_API_KEY;

    if (envKey) {
      return envKey;
    }

    // Nenhuma chave encontrada
    const providerName = provider === 'OPENAI' ? 'OpenAI' : provider === 'GEMINI' ? 'Gemini' : 'Anthropic';
    throw new Error(`${providerName} API Key não configurada. Configure em /settings/integrations ou via variável de ambiente.`);
  }

  /**
   * Gera resposta usando LLM
   */
  async generateResponse(config: {
    provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC';
    organizationId?: string; // NOVO: ID da organização para buscar chave do banco
    model: string;
    systemPrompt?: string;
    userPrompt: string;
    contextMessages?: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    switch (config.provider) {
      case 'OPENAI':
        return this.callOpenAI(config, config.organizationId);
      case 'GEMINI':
        return this.callGemini(config, config.organizationId);
      case 'ANTHROPIC':
        return this.callAnthropic(config, config.organizationId);
      default:
        throw new Error(`Provedor de IA não suportado: ${config.provider}`);
    }
  }

  /**
   * Chama API da OpenAI
   */
  private async callOpenAI(
    config: {
      model: string;
      systemPrompt?: string;
      userPrompt: string;
      contextMessages?: Array<{ role: string; content: string }>;
      temperature?: number;
      maxTokens?: number;
    },
    organizationId?: string
  ): Promise<string> {
    const apiKey = await this.getApiKey('OPENAI', organizationId);

    const messages: Array<{ role: string; content: string }> = [];

    if (config.systemPrompt) {
      messages.push({
        role: 'system',
        content: config.systemPrompt,
      });
    }

    if (config.contextMessages) {
      messages.push(...config.contextMessages);
    }

    messages.push({
      role: 'user',
      content: config.userPrompt,
    });

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: config.model,
          messages,
          temperature: config.temperature || 0.7,
          max_tokens: config.maxTokens || 1000,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000, // 60 segundos
        }
      );

      return response.data.choices[0]?.message?.content || '';
    } catch (error: any) {
      console.error('Erro ao chamar OpenAI:', error.response?.data || error.message);
      throw new Error(`Erro ao chamar OpenAI: ${error.message}`);
    }
  }

  /**
   * Chama API do Google Gemini
   */
  private async callGemini(
    config: {
      model: string;
      systemPrompt?: string;
      userPrompt: string;
      contextMessages?: Array<{ role: string; content: string }>;
      temperature?: number;
      maxTokens?: number;
    },
    organizationId?: string
  ): Promise<string> {
    const apiKey = await this.getApiKey('GEMINI', organizationId);

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // Construir contexto
    let fullPrompt = '';
    if (config.systemPrompt) {
      fullPrompt += `System: ${config.systemPrompt}\n\n`;
    }

    if (config.contextMessages) {
      for (const msg of config.contextMessages) {
        fullPrompt += `${msg.role}: ${msg.content}\n`;
      }
      fullPrompt += '\n';
    }

    fullPrompt += config.userPrompt;

    contents.push({
      role: 'user',
      parts: [{ text: fullPrompt }],
    });

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${apiKey}`,
        {
          contents,
          generationConfig: {
            temperature: config.temperature || 0.7,
            maxOutputTokens: config.maxTokens || 1000,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      return response.data.candidates[0]?.content?.parts[0]?.text || '';
    } catch (error: any) {
      console.error('Erro ao chamar Gemini:', error.response?.data || error.message);
      throw new Error(`Erro ao chamar Gemini: ${error.message}`);
    }
  }

  /**
   * Chama API da Anthropic (Claude)
   */
  private async callAnthropic(
    config: {
      model: string;
      systemPrompt?: string;
      userPrompt: string;
      contextMessages?: Array<{ role: string; content: string }>;
      temperature?: number;
      maxTokens?: number;
    },
    organizationId?: string
  ): Promise<string> {
    const apiKey = await this.getApiKey('ANTHROPIC', organizationId);

    const messages: Array<{ role: string; content: string }> = [];

    if (config.contextMessages) {
      messages.push(...config.contextMessages);
    }

    messages.push({
      role: 'user',
      content: config.userPrompt,
    });

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: config.model,
          max_tokens: config.maxTokens || 1000,
          temperature: config.temperature || 0.7,
          system: config.systemPrompt,
          messages,
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      return response.data.content[0]?.text || '';
    } catch (error: any) {
      console.error('Erro ao chamar Anthropic:', error.response?.data || error.message);
      throw new Error(`Erro ao chamar Anthropic: ${error.message}`);
    }
  }
}






