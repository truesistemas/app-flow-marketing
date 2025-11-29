import axios from 'axios';

/**
 * AI Service
 * 
 * Gerencia chamadas para diferentes provedores de LLM (OpenAI, Gemini, Anthropic)
 */
export class AIService {
  /**
   * Gera resposta usando LLM
   */
  async generateResponse(config: {
    provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC';
    model: string;
    systemPrompt?: string;
    userPrompt: string;
    contextMessages?: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    switch (config.provider) {
      case 'OPENAI':
        return this.callOpenAI(config);
      case 'GEMINI':
        return this.callGemini(config);
      case 'ANTHROPIC':
        return this.callAnthropic(config);
      default:
        throw new Error(`Provedor de IA não suportado: ${config.provider}`);
    }
  }

  /**
   * Chama API da OpenAI
   */
  private async callOpenAI(config: {
    model: string;
    systemPrompt?: string;
    userPrompt: string;
    contextMessages?: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

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
  private async callGemini(config: {
    model: string;
    systemPrompt?: string;
    userPrompt: string;
    contextMessages?: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada');
    }

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
  private async callAnthropic(config: {
    model: string;
    systemPrompt?: string;
    userPrompt: string;
    contextMessages?: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY não configurada');
    }

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






