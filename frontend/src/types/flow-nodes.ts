/**
 * Tipos de nós do Flow Builder (compatível com backend)
 */

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

export interface BaseNode {
  id: string;
  type: NodeType;
  position: {
    x: number;
    y: number;
  };
  label?: string;
}

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

export interface MessageNode extends BaseNode {
  type: 'MESSAGE';
  config: {
    text: string;
    variables?: string[];
  };
}

export interface MediaNode extends BaseNode {
  type: 'MEDIA';
  config: {
    mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
    url: string;
    caption?: string;
  };
}

export interface ActionNode extends BaseNode {
  type: 'ACTION';
  config: {
    actionType: 'WAIT_RESPONSE' | 'WAIT_TIME' | 'WAIT_INPUT';
    timeout?: number;
    saveResponseAs?: string;
  };
}

export interface TimerNode extends BaseNode {
  type: 'TIMER';
  config: {
    delaySeconds?: number; // Intervalo em segundos
    delayMinutes?: number;  // Intervalo em minutos
    delayHours?: number;     // Intervalo em horas
  };
}

export interface HttpNode extends BaseNode {
  type: 'HTTP';
  config: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: Record<string, any>;
  };
}

export interface AINode extends BaseNode {
  type: 'AI';
  config: {
    provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC';
    model: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    userPrompt: string;
    contextVariables?: string[];
    saveResponseAs?: string;
    classificationMode?: 'NONE' | 'SENTIMENT' | 'KEYWORDS' | 'CUSTOM';
    classificationConfig?: {
      sentimentThreshold?: number;
      positiveKeywords?: string[];
      negativeKeywords?: string[];
      keywordRoutes?: Array<{
        keywords: string[];
        routeLabel: string;
      }>;
      customPrompt?: string;
    };
  };
}

export interface ConditionNode extends BaseNode {
  type: 'CONDITION';
  config: {
    condition: {
      variable: string;
      operator: 'EQUALS' | 'CONTAINS' | 'GREATER_THAN' | 'LESS_THAN';
      value: any;
    };
  };
}

export interface EndNode extends BaseNode {
  type: 'END';
  config: {
    message?: string;
  };
}

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

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
};
