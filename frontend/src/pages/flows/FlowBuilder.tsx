import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFlowStore } from '../../store/useFlowStore';
import { useEvolutionInstanceStore } from '../../store/useEvolutionInstanceStore';
import api from '../../services/api';
import { ArrowLeft, Save, Loader2, Play, X, CheckCircle2, XCircle, AlertCircle, RotateCcw, History } from 'lucide-react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Node as ReactFlowNode,
  type Edge as ReactFlowEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from 'reactflow';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDrop } from 'react-dnd';
import CustomNode from '../../components/nodes/CustomNode';
import FlowBuilderSidebar from '../../components/FlowBuilderSidebar';
import 'reactflow/dist/style.css';

const nodeTypes = {
  custom: CustomNode,
};

function FlowCanvas() {
  const reactFlowInstance = useReactFlow();
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const onEdgesChange = useFlowStore((state) => state.onEdgesChange);
  const onConnect = useFlowStore((state) => state.onConnect);
  const addNode = useFlowStore((state) => state.addNode);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [{ isOver }, drop] = useDrop({
    accept: 'node',
    drop: (item: { type: string }, monitor) => {
      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds || !reactFlowInstance) return;

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: clientOffset.x - reactFlowBounds.left,
        y: clientOffset.y - reactFlowBounds.top,
      });

      addNode(item.type, position);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  // Combinar refs para drop e div
  const setDropRef = useCallback(
    (node: HTMLDivElement | null) => {
      dropRef.current = node;
      drop(node);
    },
    [drop]
  );

  // Handlers com tipos corretos do ReactFlow
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes as any);
    },
    [onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes as any);
    },
    [onEdgesChange]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      onConnect(connection as any);
    },
    [onConnect]
  );

  const getNodeColor = useCallback((node: ReactFlowNode) => {
    const colors: Record<string, string> = {
      START: '#10b981',
      MESSAGE: '#3b82f6',
      MEDIA: '#a855f7',
      ACTION: '#eab308',
      HTTP: '#f97316',
      AI: '#ec4899',
      CONDITION: '#6366f1',
      END: '#ef4444',
    };
    return colors[(node.data as any)?.type] || '#6b7280';
  }, []);

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <div
        ref={setDropRef}
        className={`w-full h-full ${isOver ? 'bg-primary-50/20 dark:bg-primary-900/20' : ''}`}
      >
        <ReactFlow
          nodes={nodes as ReactFlowNode[]}
          edges={edges as ReactFlowEdge[]}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodesDelete={(nodesToDelete) => {
            // ReactFlow já remove automaticamente via onNodesChange
            // Mas podemos adicionar lógica adicional se necessário
            console.log('Nós deletados:', nodesToDelete);
          }}
          onEdgesDelete={(edgesToDelete) => {
            // ReactFlow já remove automaticamente via onEdgesChange
            console.log('Edges deletados:', edgesToDelete);
          }}
          deleteKeyCode={['Backspace', 'Delete']}
          nodeTypes={nodeTypes as any}
          fitView
          className="bg-slate-50 dark:bg-slate-900"
        >
          <Background />
          <Controls />
          <MiniMap nodeColor={getNodeColor} maskColor="rgba(0, 0, 0, 0.1)" />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function FlowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flowName, setFlowName] = useState('');
  const [showTestModal, setShowTestModal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testLogs, setTestLogs] = useState<any[]>([]);
  const [testContactPhone, setTestContactPhone] = useState('');
  const [testStartNodeId, setTestStartNodeId] = useState('');
  const [testInstanceId, setTestInstanceId] = useState('');
  const [showExecutionsModal, setShowExecutionsModal] = useState(false);
  const { instances, listInstances, loading: loadingInstances } = useEvolutionInstanceStore();
  const [executions, setExecutions] = useState<any[]>([]);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const setNodes = useFlowStore((state) => state.setNodes);
  const setEdges = useFlowStore((state) => state.setEdges);
  const resetFlow = useFlowStore((state) => state.resetFlow);

  // Polling para buscar execuções ativas e atualizar nós
  const fetchActiveExecutions = useCallback(async () => {
    if (!id || id === 'new') return;

    try {
      const response = await api.get(`/api/flows/${id}/executions`);
      const executions = response.data?.executions || [];

      // Atualizar nós com informações de execução
      const currentNodes = useFlowStore.getState().nodes;
      const updatedNodes = currentNodes.map((node) => {
        // Encontrar execuções que estão neste nó
        const executionsAtNode = executions.filter(
          (exec: any) => exec.currentNodeId === node.id
        );

        // Coletar logs para este nó específico
        let logs: any[] = [];
        
        executions.forEach((exec: any) => {
          // Logs de nós executados relacionados a este nó
          exec.executedNodes?.forEach((execNode: any) => {
            if (execNode.nodeId === node.id) {
              logs.push({
                message: `✅ Nó ${node.data?.type || 'UNKNOWN'} executado`,
                timestamp: new Date(execNode.timestamp),
                type: 'success' as const,
              });
            }
          });

          // Logs de mensagens recebidas (apenas para nó START)
          if (node.data?.type === 'START') {
            exec.userResponses?.forEach((response: any) => {
              if (response.nodeId === node.id || !response.nodeId) {
                logs.push({
                  message: `📨 Mensagem recebida: "${response.response}"`,
                  timestamp: new Date(response.timestamp),
                  type: 'info' as const,
                });
              }
            });
          }

          // Logs de execução atual (se este nó está sendo executado)
          if (exec.currentNodeId === node.id) {
            logs.push({
              message: `🔄 Nó em execução (Status: ${exec.status})`,
              timestamp: new Date(exec.updatedAt),
              type: exec.status === 'PROCESSING' ? 'info' : 'warning' as const,
            });
          }
        });

        // Contar execuções pendentes (WAITING) neste nó
        const pendingExecutions = executions.filter(
          (exec: any) => exec.currentNodeId === node.id && exec.status === 'WAITING'
        ).length;

        return {
          ...node,
          data: {
            ...node.data,
            isExecuting: executionsAtNode.length > 0,
            pendingCount: pendingExecutions, // Contador de execuções pendentes
            logs: logs.slice(-10), // Últimos 10 logs
            flowId: id,
          },
        };
      });

      setNodes(updatedNodes);
    } catch (error) {
      console.error('Erro ao buscar execuções:', error);
    }
  }, [id, setNodes]);

  useEffect(() => {
    if (id && id !== 'new') {
      loadFlow(id);
      
      // Iniciar polling para execuções ativas
      fetchActiveExecutions();
      pollingIntervalRef.current = setInterval(fetchActiveExecutions, 2000);
    } else {
      resetFlow();
      setFlowName('');
    }

    // Carregar instâncias da Evolution API
    listInstances({ status: 'ACTIVE' });

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [id, fetchActiveExecutions, resetFlow, listInstances]);

  const loadExecutions = async () => {
    if (!id || id === 'new') return;
    
    try {
      setLoadingExecutions(true);
      const response = await api.get(`/api/flows/${id}/executions`);
      // Filtrar apenas execuções COMPLETED ou ABANDONED
      const allExecutions = response.data?.executions || [];
      const completedOrAbandoned = allExecutions.filter(
        (exec: any) => exec.status === 'COMPLETED' || exec.status === 'ABANDONED'
      );
      setExecutions(completedOrAbandoned);
    } catch (error) {
      console.error('Erro ao carregar execuções:', error);
    } finally {
      setLoadingExecutions(false);
    }
  };

  const handleResetExecution = async (executionId: string) => {
    if (!id || id === 'new') return;
    
    if (!confirm('Tem certeza que deseja resetar esta execução? O flow será reiniciado do início.')) {
      return;
    }

    try {
      await api.post(`/api/flows/${id}/executions/${executionId}/reset`);
      alert('Execução resetada com sucesso!');
      await loadExecutions();
      fetchActiveExecutions(); // Atualizar execuções ativas
    } catch (error: any) {
      console.error('Erro ao resetar execução:', error);
      alert(error.response?.data?.error || 'Erro ao resetar execução');
    }
  };

  const loadFlow = async (flowId: string) => {
    try {
      setLoading(true);
      const response = await api.get<{ flow: any }>(`/api/flows/${flowId}`);
      const flow = response.data.flow;
      setFlowName(flow.name || '');
      if (flow.nodes) {
        // Converter nodes do formato do backend para o formato do React Flow
        const reactFlowNodes = Array.isArray(flow.nodes)
          ? flow.nodes.map((node: any) => ({
              id: node.id,
              type: 'custom',
              position: node.position || { x: 0, y: 0 },
              data: {
                label: node.label || node.type,
                type: node.type,
                config: node.config || {},
              },
            }))
          : [];
        setNodes(reactFlowNodes);
      }
      if (flow.edges) {
        // Converter edges do formato do backend para o formato do React Flow
        const reactFlowEdges = Array.isArray(flow.edges)
          ? flow.edges.map((edge: any) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
            }))
          : [];
        setEdges(reactFlowEdges);
      }
    } catch (error) {
      console.error('Erro ao carregar flow:', error);
      alert('Erro ao carregar flow');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!flowName.trim()) {
      alert('Digite um nome para o flow');
      return;
    }

    try {
      setSaving(true);
      // Converter nodes e edges do formato do React Flow para o formato do backend
      const flowNodes = nodes.map((node) => ({
        id: node.id,
        type: node.data.type,
        position: node.position,
        label: node.data.label,
        config: node.data.config || {},
      }));

      const flowEdges = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      }));

      const flowData = {
        name: flowName,
        nodes: flowNodes,
        edges: flowEdges,
        isActive: true, // Garantir que flow seja ativo ao salvar
      };

      if (id && id !== 'new') {
        // Atualizar flow existente
        await api.put(`/api/flows/${id}`, flowData);
        alert('Flow atualizado com sucesso!');
      } else {
        // Criar novo flow
        const response = await api.post<{ flow: { id: string } }>('/api/flows', flowData);
        navigate(`/flows/${response.data.flow.id}`);
        alert('Flow criado com sucesso!');
      }
    } catch (error: any) {
      console.error('Erro ao salvar flow:', error);
      alert(error.response?.data?.error || 'Erro ao salvar flow');
    } finally {
      setSaving(false);
    }
  };

  const handleTestFlow = async () => {
    // Prevenir múltiplos cliques simultâneos
    if (testing) {
      console.log('Teste já em andamento, ignorando novo clique');
      return;
    }

    if (!id || id === 'new') {
      alert('Salve o flow antes de testar');
      return;
    }

    // Verificar se há nós no flow
    const nodes = useFlowStore.getState().nodes;
    if (nodes.length === 0) {
      alert('Adicione pelo menos um nó ao flow antes de testar');
      return;
    }

    // Se telefone foi informado, verificar se instância foi selecionada
    if (testContactPhone && !testInstanceId) {
      alert('Selecione uma instância da Evolution API para disparar o teste');
      return;
    }

    try {
      setTesting(true);
      setTestLogs([]);
      const response = await api.post<{ success: boolean; logs: any[] }>(`/api/flows/${id}/test`, {
        contactPhone: testContactPhone || undefined,
        startNodeId: testStartNodeId || undefined,
        instanceId: testInstanceId || undefined,
      });
      
      if (response.data?.logs) {
        setTestLogs(response.data.logs);
        
        // Verificar se houve erros
        const hasErrors = response.data.logs.some((log: any) => log.result === 'error');
        if (hasErrors) {
          console.warn('Teste concluído com erros. Verifique os logs abaixo.');
        } else {
          console.log('Teste concluído com sucesso!');
          
          // Se foi um teste real (com telefone e instância), mostrar mensagem especial
          if (testContactPhone && testInstanceId) {
            alert('Flow iniciado com sucesso! Acompanhe a execução em tempo real nos blocos do flow. Os blocos serão atualizados automaticamente conforme o flow é processado.');
            // Atualizar execuções imediatamente
            fetchActiveExecutions();
          }
        }
      } else {
        setTestLogs([{
          nodeId: 'flow',
          nodeType: 'FLOW',
          result: 'error',
          error: 'Resposta inválida do servidor',
          timestamp: new Date(),
        }]);
      }
    } catch (error: any) {
      console.error('Erro ao testar flow:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Erro ao testar flow';
      
      setTestLogs([{
        nodeId: 'flow',
        nodeType: 'FLOW',
        result: 'error',
        error: errorMessage,
        timestamp: new Date(),
      }]);
      
      alert(`Erro ao testar flow: ${errorMessage}`);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="h-16 glass-effect border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => navigate('/flows')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="text-xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 rounded px-2 py-1"
            placeholder="Nome do Flow"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setShowExecutionsModal(true);
              await loadExecutions();
            }}
            disabled={!id || id === 'new'}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <History className="w-4 h-4" />
            Execuções
          </button>
          <button
            onClick={() => setShowTestModal(true)}
            disabled={!id || id === 'new'}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Testar Flow
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Flow
              </>
            )}
          </button>
        </div>
      </div>

      <DndProvider backend={HTML5Backend}>
        <ReactFlowProvider>
          <div className="flex-1 flex overflow-hidden">
            <FlowBuilderSidebar />
            <div className="flex-1">
              <FlowCanvas />
            </div>
          </div>
        </ReactFlowProvider>
      </DndProvider>

      {/* Modal de Teste */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Testar Flow</h2>
              <button
                onClick={() => {
                  setShowTestModal(false);
                  setTestLogs([]);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Telefone de Teste (opcional)
                  </label>
                  <input
                    type="text"
                    value={testContactPhone}
                    onChange={(e) => {
                      setTestContactPhone(e.target.value);
                      // Limpar instância se telefone for removido
                      if (!e.target.value) {
                        setTestInstanceId('');
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                    placeholder="5511999999999"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Se informado, o teste disparará o flow através da Evolution API
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nó Inicial (opcional)
                  </label>
                  <select
                    value={testStartNodeId}
                    onChange={(e) => setTestStartNodeId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Início do Flow</option>
                    {nodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.data.label || node.data.type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {testContactPhone && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Instância Evolution API <span className="text-red-500">*</span>
                  </label>
                  {loadingInstances ? (
                    <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800">
                      <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Carregando instâncias...</span>
                    </div>
                  ) : instances.filter(i => i.status === 'ACTIVE').length === 0 ? (
                    <div className="px-4 py-2 border border-yellow-300 dark:border-yellow-600 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        Nenhuma instância ativa encontrada. Configure uma instância em Configurações → Integrações.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={testInstanceId}
                      onChange={(e) => setTestInstanceId(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                      required
                    >
                      <option value="">Selecione uma instância</option>
                      {instances
                        .filter(i => i.status === 'ACTIVE')
                        .map((instance) => (
                          <option key={instance.id} value={instance.id}>
                            {instance.name} ({instance.instanceName})
                            {instance.connectedPhone && ` - ${instance.connectedPhone}`}
                          </option>
                        ))}
                    </select>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Selecione a instância que será usada para disparar o teste do flow
                  </p>
                </div>
              )}

              <button
                onClick={handleTestFlow}
                disabled={testing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Testando...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Iniciar Teste
                  </>
                )}
              </button>

              {testLogs.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Logs de Execução
                  </h3>
                  <div className="space-y-2">
                    {testLogs.map((log, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border ${
                          log.result === 'success'
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : log.result === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {log.result === 'success' ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                              ) : log.result === 'error' ? (
                                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              )}
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {log.nodeType} - {log.nodeId}
                              </span>
                            </div>
                            {log.message && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{log.message}</p>
                            )}
                            {log.error && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{log.error}</p>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {log.executionTime ? `${log.executionTime}ms` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Execuções */}
      {showExecutionsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Execuções Completadas/Abandonadas</h2>
              <button
                onClick={() => {
                  setShowExecutionsModal(false);
                  setExecutions([]);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingExecutions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : executions.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Nenhuma execução completada ou abandonada encontrada.
                </div>
              ) : (
                <div className="space-y-3">
                  {executions.map((execution: any) => (
                    <div
                      key={execution.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded ${
                                execution.status === 'COMPLETED'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                              }`}
                            >
                              {execution.status === 'COMPLETED' ? 'Completada' : 'Abandonada'}
                            </span>
                            {execution.contact && (
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                Contato: {execution.contact.phone}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500 space-y-1">
                            <div>
                              Iniciada em: {new Date(execution.startedAt).toLocaleString('pt-BR')}
                            </div>
                            {execution.completedAt && (
                              <div>
                                Completada em: {new Date(execution.completedAt).toLocaleString('pt-BR')}
                              </div>
                            )}
                            {execution.currentNodeId && (
                              <div>
                                Último nó: {execution.currentNodeId}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleResetExecution(execution.id)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Resetar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

