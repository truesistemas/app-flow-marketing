import { PrismaClient } from '@prisma/client';
import {
  FlowNode,
  FlowEdge,
  FlowStructure,
  FlowContextData,
  StartNode,
  MessageNode,
  MediaNode,
  ActionNode,
  TimerNode,
  HttpNode,
  AINode,
  ConditionNode,
} from '../types/flow-nodes';

export interface FlowTestLog {
  nodeId: string;
  nodeType: string;
  result: 'success' | 'error' | 'skipped';
  message?: string;
  error?: string;
  timestamp: Date;
  executionTime?: number;
}

export interface FlowTestOptions {
  contactPhone?: string;
  startNodeId?: string;
}

export class FlowTestService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Testa a execução de um flow sem enviar mensagens reais
   */
  async testFlow(flowId: string, organizationId: string, options: FlowTestOptions = {}): Promise<{
    success: boolean;
    logs: FlowTestLog[];
  }> {
    const logs: FlowTestLog[] = [];

    try {
      // Buscar flow
      const flow = await this.prisma.flow.findFirst({
        where: {
          id: flowId,
          organizationId,
        },
      });

      if (!flow) {
        throw new Error('Flow não encontrado');
      }

      // Verificar se nodes e edges são arrays diretos ou se estão em uma estrutura FlowStructure
      let nodes: FlowNode[] = [];
      let edges: FlowEdge[] = [];

      if (flow.nodes) {
        // Se nodes é um array, usar diretamente
        if (Array.isArray(flow.nodes)) {
          nodes = flow.nodes as unknown as FlowNode[];
        } 
        // Se nodes é um objeto FlowStructure (com propriedades nodes e edges)
        else if (typeof flow.nodes === 'object' && 'nodes' in flow.nodes) {
          const flowStructure = flow.nodes as unknown as FlowStructure;
          nodes = flowStructure.nodes || [];
          edges = flowStructure.edges || [];
        }
      }

      // Se edges está separado no flow, usar esses edges (sobrescreve se já foram definidos)
      if (flow.edges && Array.isArray(flow.edges)) {
        edges = flow.edges as unknown as FlowEdge[];
      }
      
      // Se ainda não temos edges, tentar buscar do flow.edges mesmo que não seja array
      if (edges.length === 0 && flow.edges && typeof flow.edges === 'object' && 'edges' in flow.edges) {
        const flowStructure = flow.edges as unknown as FlowStructure;
        edges = flowStructure.edges || [];
      }

      // Log para debug
      console.log(`[Flow Test] Flow encontrado: ${flow.name}`);
      console.log(`[Flow Test] Nodes encontrados: ${nodes.length}`);
      console.log(`[Flow Test] Edges encontrados: ${edges.length}`);
      console.log(`[Flow Test] Estrutura nodes:`, Array.isArray(flow.nodes) ? 'Array' : typeof flow.nodes);
      console.log(`[Flow Test] Estrutura edges:`, Array.isArray(flow.edges) ? 'Array' : typeof flow.edges);
      console.log(`[Flow Test] Nodes:`, JSON.stringify(nodes.map(n => ({ id: n.id, type: n.type })), null, 2));
      console.log(`[Flow Test] Edges:`, JSON.stringify(edges.map(e => ({ id: e.id, source: e.source, target: e.target })), null, 2));

      if (nodes.length === 0) {
        throw new Error('Flow não possui nós. Adicione pelo menos um nó ao flow antes de testar.');
      }

      // Encontrar nó inicial
      let currentNodeId = options.startNodeId;
      if (!currentNodeId) {
        const startNode = nodes.find((n) => n.type === 'START') as StartNode | undefined;
        if (!startNode) {
          throw new Error('Flow não possui nó START');
        }
        currentNodeId = startNode.id;
      }

      // Contexto simulado
      const context: FlowContextData = {
        variables: {
          contactPhone: options.contactPhone || '5511999999999',
        },
        userResponses: [],
        executedNodes: [],
      };

      // Executar flow
      let maxIterations = 100; // Prevenir loops infinitos
      let iterations = 0;

      while (currentNodeId && iterations < maxIterations) {
        iterations++;
        const startTime = Date.now();

        const currentNode = nodes.find((n) => n.id === currentNodeId) as FlowNode | undefined;

        if (!currentNode) {
          logs.push({
            nodeId: currentNodeId,
            nodeType: 'UNKNOWN',
            result: 'error',
            error: 'Nó não encontrado',
            timestamp: new Date(),
          });
          break;
        }

        try {
          console.log(`[Flow Test] Processando nó: ${currentNode.id} (${currentNode.type})`);
          
          // Processar nó baseado no tipo
          const result = await this.processTestNode(currentNode, context);
          const executionTime = Date.now() - startTime;

          logs.push({
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            result: result.success ? 'success' : 'error',
            message: result.message,
            error: result.error,
            timestamp: new Date(),
            executionTime,
          });

          console.log(`[Flow Test] Resultado do nó ${currentNode.id}:`, result);

          if (!result.success || currentNode.type === 'END') {
            console.log(`[Flow Test] Parando execução: success=${result.success}, type=${currentNode.type}`);
            break;
          }

          // Encontrar próximo nó
          const nextNodeId = this.findNextNode(currentNode.id, edges, result.conditionResult);
          console.log(`[Flow Test] Próximo nó encontrado: ${nextNodeId || 'null'}`);
          currentNodeId = nextNodeId || undefined;
          
          if (!currentNodeId) {
            console.log(`[Flow Test] Nenhum próximo nó encontrado. Finalizando execução.`);
            logs.push({
              nodeId: currentNode.id,
              nodeType: currentNode.type,
              result: 'success',
              message: 'Flow finalizado (sem próximo nó)',
              timestamp: new Date(),
            });
            break;
          }
        } catch (error: any) {
          const executionTime = Date.now() - startTime;
          logs.push({
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            result: 'error',
            error: error.message || 'Erro ao processar nó',
            timestamp: new Date(),
            executionTime,
          });
          break;
        }
      }

      return {
        success: logs.every((log) => log.result !== 'error'),
        logs,
      };
    } catch (error: any) {
      logs.push({
        nodeId: 'flow',
        nodeType: 'FLOW',
        result: 'error',
        error: error.message || 'Erro ao testar flow',
        timestamp: new Date(),
      });

      return {
        success: false,
        logs,
      };
    }
  }

  /**
   * Processa um nó em modo teste
   */
  private async processTestNode(
    node: FlowNode,
    context: FlowContextData
  ): Promise<{ success: boolean; message?: string; error?: string; conditionResult?: boolean }> {
    switch (node.type) {
      case 'START':
        return { success: true, message: 'Nó inicial processado' };

      case 'MESSAGE':
        const messageNode = node as MessageNode;
        return {
          success: true,
          message: `Mensagem simulada: ${messageNode.config.text || 'Sem texto'}`,
        };

      case 'MEDIA':
        const mediaNode = node as MediaNode;
        return {
          success: true,
          message: `Mídia simulada: ${mediaNode.config.url || 'Sem URL'}`,
        };

      case 'ACTION':
        const actionNode = node as ActionNode;
        return {
          success: true,
          message: `Ação simulada: ${actionNode.config.actionType || 'Sem ação'}`,
        };

      case 'TIMER':
        const timerNode = node as TimerNode;
        const delaySeconds = timerNode.config.delaySeconds || 0;
        const delayMinutes = timerNode.config.delayMinutes || 0;
        const delayHours = timerNode.config.delayHours || 0;
        const totalDelay = delaySeconds + delayMinutes * 60 + delayHours * 3600;
        return {
          success: true,
          message: `Timer simulado: aguardando ${totalDelay} segundos (${delayHours}h ${delayMinutes}m ${delaySeconds}s)`,
        };

      case 'HTTP':
        const httpNode = node as HttpNode;
        // Simular requisição HTTP sem fazer chamada real
        return {
          success: true,
          message: `Requisição HTTP simulada: ${httpNode.config.method || 'GET'} ${httpNode.config.url || ''}`,
        };

      case 'AI':
        const aiNode = node as AINode;
        // Simular resposta de IA sem fazer chamada real
        return {
          success: true,
          message: `Resposta de IA simulada para: ${aiNode.config.userPrompt || 'Sem prompt'}`,
        };

      case 'CONDITION':
        const conditionNode = node as ConditionNode;
        // Avaliar condição simples
        const conditionResult = this.evaluateTestCondition(conditionNode.config.condition || '', context);
        return {
          success: true,
          message: `Condição avaliada: ${conditionResult}`,
          conditionResult,
        };

      case 'END':
        return { success: true, message: 'Flow finalizado' };

      default:
        return { success: false, error: `Tipo de nó não suportado: ${(node as any).type}` };
    }
  }

  /**
   * Avalia uma condição simples em modo teste
   */
  private evaluateTestCondition(
    condition: { variable: string; operator: string; value: any },
    context: FlowContextData
  ): boolean {
    // Implementação simples para teste
    // Em produção, usar uma biblioteca de avaliação de expressões
    try {
      const variableValue = context.variables[condition.variable];
      const conditionValue = condition.value;

      switch (condition.operator) {
        case 'EQUALS':
          return String(variableValue) === String(conditionValue);
        case 'CONTAINS':
          return String(variableValue).includes(String(conditionValue));
        case 'GREATER_THAN':
          return Number(variableValue) > Number(conditionValue);
        case 'LESS_THAN':
          return Number(variableValue) < Number(conditionValue);
        case 'EXISTS':
          return variableValue !== undefined && variableValue !== null;
        case 'REGEX':
          const regex = new RegExp(String(conditionValue));
          return regex.test(String(variableValue));
        default:
          return true;
      }
    } catch {
      return true;
    }
  }

  /**
   * Encontra o próximo nó baseado nas arestas
   */
  private findNextNode(
    currentNodeId: string,
    edges: any[],
    conditionResult?: boolean
  ): string | null {
    console.log(`[Flow Test] Buscando próximo nó para: ${currentNodeId}`);
    console.log(`[Flow Test] Total de edges disponíveis: ${edges.length}`);
    console.log(`[Flow Test] Resultado da condição: ${conditionResult}`);
    
    // Encontrar aresta que sai do nó atual
    const outgoingEdges = edges.filter((e) => e.source === currentNodeId);
    console.log(`[Flow Test] Edges saindo de ${currentNodeId}: ${outgoingEdges.length}`);
    console.log(`[Flow Test] Edges:`, JSON.stringify(outgoingEdges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, label: e.label })), null, 2));

    if (outgoingEdges.length === 0) {
      console.log(`[Flow Test] Nenhuma aresta encontrada saindo de ${currentNodeId}`);
      return null;
    }

    // Se houver apenas uma aresta, retornar o destino
    if (outgoingEdges.length === 1) {
      console.log(`[Flow Test] Uma única aresta encontrada. Próximo nó: ${outgoingEdges[0].target}`);
      return outgoingEdges[0].target;
    }

    // Se houver múltiplas arestas e resultado de condição, usar para escolher
    if (conditionResult !== undefined) {
      const trueEdge = outgoingEdges.find((e) => e.sourceHandle === 'true' || e.label === 'true');
      const falseEdge = outgoingEdges.find((e) => e.sourceHandle === 'false' || e.label === 'false');

      console.log(`[Flow Test] Aresta TRUE encontrada:`, trueEdge ? trueEdge.target : 'não encontrada');
      console.log(`[Flow Test] Aresta FALSE encontrada:`, falseEdge ? falseEdge.target : 'não encontrada');

      if (conditionResult && trueEdge) {
        console.log(`[Flow Test] Usando aresta TRUE. Próximo nó: ${trueEdge.target}`);
        return trueEdge.target;
      }
      if (!conditionResult && falseEdge) {
        console.log(`[Flow Test] Usando aresta FALSE. Próximo nó: ${falseEdge.target}`);
        return falseEdge.target;
      }
    }

    // Retornar primeira aresta por padrão
    console.log(`[Flow Test] Usando primeira aresta por padrão. Próximo nó: ${outgoingEdges[0].target}`);
    return outgoingEdges[0].target;
  }
}






