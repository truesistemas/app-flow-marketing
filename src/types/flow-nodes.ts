/**
 * Tipos de nós do Flow Builder
 * Cada nó representa uma ação ou decisão no fluxo de conversa
 */

// ============================================
// BASE NODE INTERFACE
// ============================================
export interface BaseNode {
  id: string; // ID único do nó no flow
  type: NodeType;
  position: {
    x: number;
    y: number;
  };
  label?: string; // Label opcional para exibição no UI
}

export type NodeType =
  | 'START'
  | 'MESSAGE'
  | 'MEDIA'
  | 'ACTION'
  | 'TIMER'
  | 'HTTP'
  | 'AI'
  | 'CONDITION'
  | 'END';

// ============================================
// START NODE (Gatilho)
// ============================================
export interface StartNode extends BaseNode {
  type: 'START';
  config: {
    triggerType: 
      | 'KEYWORD_EXACT'      // Palavra exata (ex: "sim")
      | 'KEYWORD_CONTAINS'   // Contém palavra (ex: "sim" em "sim, quero")
      | 'KEYWORD_STARTS_WITH'// Começa com (ex: "sim" em "sim, por favor")
      | 'ANY_RESPONSE'       // Qualquer resposta dispara
      | 'TIMER'              // Dispara após X tempo (mesmo sem resposta)
      | 'WEBHOOK'
      | 'MANUAL';
    keyword?: string; // Palavra-chave (para KEYWORD_*)
    matchMode?: 'EXACT' | 'CONTAINS' | 'STARTS_WITH'; // Modo de correspondência
    timerSeconds?: number; // Para trigger TIMER
    triggerOnAnyResponse?: boolean; // Para ANY_RESPONSE (sempre true)
    webhookUrl?: string; // URL para receber webhook externo
  };
}

// ============================================
// MESSAGE NODE (Texto simples)
// ============================================
export interface MessageNode extends BaseNode {
  type: 'MESSAGE';
  config: {
    text: string; // Texto da mensagem
    variables?: string[]; // Variáveis que podem ser substituídas (ex: {{name}})
  };
}

// ============================================
// MEDIA NODE (Imagem/Video/Documento)
// ============================================
export interface MediaNode extends BaseNode {
  type: 'MEDIA';
  config: {
    mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
    url: string; // URL da mídia
    caption?: string; // Legenda opcional
    fileName?: string; // Nome do arquivo (para documentos)
  };
}

// ============================================
// ACTION NODE (Aguardar resposta do usuário)
// ============================================
export interface ActionNode extends BaseNode {
  type: 'ACTION';
  config: {
    actionType: 'WAIT_RESPONSE' | 'WAIT_TIME' | 'WAIT_INPUT';
    timeout?: number; // Timeout em segundos (opcional)
    expectedInput?: {
      type: 'TEXT' | 'NUMBER' | 'EMAIL' | 'PHONE' | 'ANY';
      validation?: {
        minLength?: number;
        maxLength?: number;
        pattern?: string; // Regex pattern
      };
    };
    saveResponseAs?: string; // Nome da variável para salvar a resposta
  };
}

// ============================================
// TIMER NODE (Aguarda intervalo antes do próximo nó)
// ============================================
export interface TimerNode extends BaseNode {
  type: 'TIMER';
  config: {
    delaySeconds?: number; // Intervalo em segundos
    delayMinutes?: number;  // Intervalo em minutos
    delayHours?: number;     // Intervalo em horas
  };
}

// ============================================
// HTTP NODE (Webhook para integrações externas)
// ============================================
export interface HttpNode extends BaseNode {
  type: 'HTTP';
  config: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: Record<string, any> | string;
    timeout?: number; // Timeout em segundos
    retryOnFailure?: boolean;
    maxRetries?: number;
    saveResponseAs?: string; // Nome da variável para salvar a resposta HTTP
  };
}

// ============================================
// AI NODE (Configuração de LLM)
// ============================================
export interface AINode extends BaseNode {
  type: 'AI';
  config: {
    provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC';
    model: string; // Ex: 'gpt-4', 'gemini-pro', 'claude-3-opus'
    temperature?: number; // 0.0 a 2.0
    maxTokens?: number;
    systemPrompt?: string; // Prompt do sistema
    userPrompt: string; // Prompt do usuário (pode conter variáveis)
    contextVariables?: string[]; // Variáveis do contexto a serem incluídas
    saveResponseAs?: string; // Nome da variável para salvar a resposta da IA
    classificationMode?: 'NONE' | 'SENTIMENT' | 'KEYWORDS' | 'CUSTOM';
    classificationConfig?: {
      // Para SENTIMENT
      sentimentThreshold?: number; // 0-1, ex: 0.7 para positivo
      positiveKeywords?: string[]; // Palavras que indicam caminho positivo
      negativeKeywords?: string[]; // Palavras que indicam caminho negativo
      
      // Para KEYWORDS
      keywordRoutes?: Array<{
        keywords: string[];
        routeLabel: string; // Nome da rota (ex: "sim", "não", "duvida")
      }>;
      
      // Para CUSTOM
      customPrompt?: string; // Prompt adicional para classificação
    };
  };
}

// ============================================
// CONDITION NODE (Decisão condicional)
// ============================================
export interface ConditionNode extends BaseNode {
  type: 'CONDITION';
  config: {
    condition: {
      variable: string; // Variável a ser avaliada
      operator: 'EQUALS' | 'CONTAINS' | 'GREATER_THAN' | 'LESS_THAN' | 'EXISTS' | 'REGEX';
      value: any; // Valor de comparação
    };
  };
}

// ============================================
// END NODE (Finalização do flow)
// ============================================
export interface EndNode extends BaseNode {
  type: 'END';
  config: {
    message?: string; // Mensagem final opcional
  };
}

// ============================================
// UNION TYPE DE TODOS OS NÓS
// ============================================
export type FlowNode =
  | StartNode
  | MessageNode
  | MediaNode
  | ActionNode
  | TimerNode
  | HttpNode
  | AINode
  | ConditionNode
  | EndNode;

// ============================================
// EDGE (Aresta conectando nós)
// ============================================
export interface FlowEdge {
  id: string;
  source: string; // ID do nó de origem
  target: string; // ID do nó de destino
  sourceHandle?: string; // Handle de saída (para condições: 'true' ou 'false')
  targetHandle?: string; // Handle de entrada
  condition?: {
    // Condição opcional para a aresta (útil para ConditionNode)
    variable?: string;
    operator?: string;
    value?: any;
  };
}

// ============================================
// FLOW STRUCTURE (Estrutura completa do flow)
// ============================================
export interface FlowStructure {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ============================================
// CONTEXT DATA (Dados de contexto da execução)
// ============================================
export interface FlowContextData {
  // Variáveis do contexto
  variables: Record<string, any>;
  
  // Histórico de respostas do usuário
  userResponses: Array<{
    nodeId: string;
    timestamp: Date;
    response: string;
  }>;
  
  // Histórico de ações executadas
  executedNodes: Array<{
    nodeId: string;
    timestamp: Date;
    nodeType: NodeType;
  }>;
  
  // Dados adicionais
  metadata?: Record<string, any>;
}


