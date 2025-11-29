/**
 * Serviço de classificação de respostas de IA
 * 
 * Fornece métodos para classificar respostas de IA baseado em:
 * - Sentimento (positivo/negativo/neutro)
 * - Palavras-chave
 * - Classificação customizada via IA
 */

export interface ClassificationConfig {
  sentimentThreshold?: number;
  positiveKeywords?: string[];
  negativeKeywords?: string[];
  keywordRoutes?: Array<{
    keywords: string[];
    routeLabel: string;
  }>;
  customPrompt?: string;
}

export class AIClassificationService {
  /**
   * Classifica texto por sentimento usando palavras-chave
   */
  async classifyBySentiment(
    text: string,
    config: ClassificationConfig
  ): Promise<'positive' | 'negative' | 'neutral'> {
    const textLower = text.toLowerCase();
    const positiveKeywords = config.positiveKeywords || [];
    const negativeKeywords = config.negativeKeywords || [];

    let positiveScore = 0;
    let negativeScore = 0;

    // Contar palavras positivas
    positiveKeywords.forEach((keyword) => {
      if (textLower.includes(keyword.toLowerCase())) {
        positiveScore++;
      }
    });

    // Contar palavras negativas
    negativeKeywords.forEach((keyword) => {
      if (textLower.includes(keyword.toLowerCase())) {
        negativeScore++;
      }
    });

    // Determinar sentimento baseado em scores
    if (positiveScore > negativeScore) {
      return 'positive';
    } else if (negativeScore > positiveScore) {
      return 'negative';
    } else {
      return 'neutral';
    }
  }

  /**
   * Classifica texto por palavras-chave e retorna label da rota
   */
  async classifyByKeywords(
    text: string,
    config: ClassificationConfig
  ): Promise<string | null> {
    const textLower = text.toLowerCase();
    const keywordRoutes = config.keywordRoutes || [];

    // Verificar cada rota
    for (const route of keywordRoutes) {
      const keywords = route.keywords || [];
      
      // Verificar se alguma palavra-chave está presente
      for (const keyword of keywords) {
        if (textLower.includes(keyword.toLowerCase())) {
          return route.routeLabel;
        }
      }
    }

    // Nenhuma palavra-chave encontrada
    return null;
  }

  /**
   * Classifica texto usando prompt customizado e IA
   */
  async classifyByCustom(
    text: string,
    aiResponse: string,
    config: ClassificationConfig,
    aiService: any // AIService
  ): Promise<string> {
    if (!config.customPrompt) {
      throw new Error('Prompt customizado não fornecido');
    }

    // Preparar prompt de classificação
    const classificationPrompt = `${config.customPrompt}

Texto original: "${text}"
Resposta da IA: "${aiResponse}"

Classifique a resposta acima e retorne APENAS o label da rota (ex: "sim", "não", "duvida", "positive", "negative").`;

    try {
      // Chamar IA para classificação
      const classificationResult = await aiService.generateResponse({
        provider: 'OPENAI', // Usar OpenAI por padrão para classificação
        model: 'gpt-3.5-turbo',
        systemPrompt: 'Você é um classificador de texto. Retorne APENAS o label da classificação, sem explicações.',
        userPrompt: classificationPrompt,
        temperature: 0.3, // Baixa temperatura para respostas mais determinísticas
        maxTokens: 50,
      });

      // Extrair label (remover espaços e converter para lowercase)
      const label = classificationResult.trim().toLowerCase();
      
      return label;
    } catch (error) {
      console.error('[AIClassification] Erro ao classificar via IA:', error);
      // Fallback: retornar "neutral" em caso de erro
      return 'neutral';
    }
  }
}


