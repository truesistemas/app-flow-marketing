import { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from '../../types/reactflow';
import {
  MessageSquare,
  Image,
  Clock,
  Globe,
  Brain,
  GitBranch,
  Play,
  Square,
  Loader2,
  Radio,
  FileText,
  X,
} from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';
import type { NodeType } from '../../types/flow-nodes';
import MediaSelector from './MediaSelector';
import api from '../../services/api';

const nodeIcons = {
  START: Play,
  MESSAGE: MessageSquare,
  MEDIA: Image,
  ACTION: Clock,
  TIMER: Clock,
  HTTP: Globe,
  AI: Brain,
  CONDITION: GitBranch,
  END: Square,
};

const nodeColors = {
  START: 'bg-green-500',
  MESSAGE: 'bg-blue-500',
  MEDIA: 'bg-purple-500',
  ACTION: 'bg-yellow-500',
  TIMER: 'bg-yellow-600',
  HTTP: 'bg-orange-500',
  AI: 'bg-pink-500',
  CONDITION: 'bg-indigo-500',
  END: 'bg-red-500',
};

const nodeLabels = {
  START: 'Início',
  MESSAGE: 'Mensagem',
  MEDIA: 'Mídia',
  ACTION: 'Ação',
  TIMER: 'Timer',
  HTTP: 'HTTP',
  AI: 'IA',
  CONDITION: 'Condição',
  END: 'Fim',
};

interface CustomNodeData {
  type: NodeType;
  config: any;
  isExecuting?: boolean;
  pendingCount?: number; // Contador de execuções pendentes (WAITING) neste nó
  logs?: Array<{
    message: string;
    timestamp: Date;
    type: 'info' | 'success' | 'error' | 'warning';
  }>;
  flowId?: string;
}

function CustomNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const type = (data as CustomNodeData).type as NodeType;
  const Icon = nodeIcons[type] || MessageSquare;
  const colorClass = nodeColors[type] || nodeColors.MESSAGE;
  const label = nodeLabels[type] || type;
  const isExecuting = (data as CustomNodeData).isExecuting || false;
  const logs = (data as CustomNodeData).logs || [];
  const flowId = (data as CustomNodeData).flowId;
  const pendingCount = (data as CustomNodeData).pendingCount || 0;
  const [executing, setExecuting] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  const handleConfigChange = (field: string, value: any) => {
    updateNodeData(id, {
      config: {
        ...(data as CustomNodeData).config,
        [field]: value,
      },
    });
  };

  const handleExecuteFromNode = async () => {
    if (!flowId) {
      alert('Flow não salvo. Salve o flow antes de executar.');
      return;
    }

    try {
      setExecuting(true);
      await api.post(`/api/flows/${flowId}/execute-from-node`, {
        nodeId: id,
        contactPhone: '5511999999999', // Telefone de teste
      });
      // O polling no FlowBuilder irá atualizar o estado
    } catch (error: any) {
      console.error('Erro ao executar a partir do nó:', error);
      alert(error.response?.data?.error || 'Erro ao executar flow');
    } finally {
      setExecuting(false);
    }
  };

  const renderNodeContent = () => {
    switch (type) {
      case 'START':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo de Gatilho
              </label>
              <select
                value={data.config.triggerType || 'KEYWORD_EXACT'}
                onChange={(e) => handleConfigChange('triggerType', e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              >
                <option value="KEYWORD_EXACT">Palavra Exata</option>
                <option value="KEYWORD_CONTAINS">Contém Palavra</option>
                <option value="KEYWORD_STARTS_WITH">Começa Com</option>
                <option value="ANY_RESPONSE">Qualquer Resposta</option>
                <option value="TIMER">Timer</option>
                <option value="WEBHOOK">Webhook</option>
                <option value="MANUAL">Manual</option>
              </select>
            </div>
            {(data.config.triggerType === 'KEYWORD_EXACT' || 
              data.config.triggerType === 'KEYWORD_CONTAINS' || 
              data.config.triggerType === 'KEYWORD_STARTS_WITH') && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Palavra-chave
                </label>
                <input
                  type="text"
                  value={data.config.keyword || ''}
                  onChange={(e) => handleConfigChange('keyword', e.target.value)}
                  placeholder="ex: oi"
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
                />
              </div>
            )}
            {data.config.triggerType === 'TIMER' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Segundos
                  </label>
                  <input
                    type="number"
                    value={data.config.timerSeconds || ''}
                    onChange={(e) => handleConfigChange('timerSeconds', parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
            )}
          </div>
        );

      case 'MESSAGE':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mensagem
            </label>
            <textarea
              value={data.config.text || ''}
              onChange={(e) => handleConfigChange('text', e.target.value)}
              placeholder="Digite sua mensagem aqui..."
              rows={4}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use {'{'}{'{'}variável{'}'}{'}'} para variáveis
            </p>
          </div>
        );

      case 'MEDIA':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo de Mídia
              </label>
              <select
                value={data.config.mediaType || 'IMAGE'}
                onChange={(e) => handleConfigChange('mediaType', e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              >
                <option value="IMAGE">Imagem</option>
                <option value="VIDEO">Vídeo</option>
                <option value="AUDIO">Áudio</option>
                <option value="DOCUMENT">Documento</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Mídia
              </label>
              <MediaSelector
                value={data.config.url || data.config.mediaUrl}
                onChange={(url) => {
                  handleConfigChange('url', url);
                  handleConfigChange('mediaUrl', url);
                }}
                onRemove={() => {
                  handleConfigChange('url', '');
                  handleConfigChange('mediaUrl', '');
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Legenda (opcional)
              </label>
              <input
                type="text"
                value={data.config.caption || ''}
                onChange={(e) => handleConfigChange('caption', e.target.value)}
                placeholder="Legenda da mídia"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
          </div>
        );

      case 'ACTION':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo de Ação
              </label>
              <select
                value={data.config.actionType || 'WAIT_RESPONSE'}
                onChange={(e) => handleConfigChange('actionType', e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              >
                <option value="WAIT_RESPONSE">Aguardar Resposta</option>
                <option value="WAIT_TIME">Aguardar Tempo</option>
                <option value="WAIT_INPUT">Aguardar Input</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Salvar como variável
              </label>
              <input
                type="text"
                value={data.config.saveResponseAs || ''}
                onChange={(e) => handleConfigChange('saveResponseAs', e.target.value)}
                placeholder="ex: userMessage"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
          </div>
        );

      case 'TIMER':
        const delaySeconds = data.config.delaySeconds || 0;
        const delayMinutes = data.config.delayMinutes || 0;
        const delayHours = data.config.delayHours || 0;
        const totalDelay = delaySeconds + delayMinutes * 60 + delayHours * 3600;
        const delayText = totalDelay > 0 
          ? `${delayHours > 0 ? delayHours + 'h ' : ''}${delayMinutes > 0 ? delayMinutes + 'min ' : ''}${delaySeconds > 0 ? delaySeconds + 's' : ''}`.trim()
          : 'Não configurado';
        
        return (
          <div className="space-y-2">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              Aguarda: {delayText}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Segundos
              </label>
              <input
                type="number"
                value={delaySeconds || ''}
                onChange={(e) => handleConfigChange('delaySeconds', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Minutos
              </label>
              <input
                type="number"
                value={delayMinutes || ''}
                onChange={(e) => handleConfigChange('delayMinutes', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Horas
              </label>
              <input
                type="number"
                value={delayHours || ''}
                onChange={(e) => handleConfigChange('delayHours', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
          </div>
        );

      case 'HTTP':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Método
              </label>
              <select
                value={data.config.method || 'POST'}
                onChange={(e) => handleConfigChange('method', e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL
              </label>
              <input
                type="text"
                value={data.config.url || ''}
                onChange={(e) => handleConfigChange('url', e.target.value)}
                placeholder="https://api.exemplo.com/webhook"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Headers (JSON)
              </label>
              <textarea
                value={typeof data.config.headers === 'object' ? JSON.stringify(data.config.headers, null, 2) : data.config.headers || '{}'}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    handleConfigChange('headers', parsed);
                  } catch {
                    handleConfigChange('headers', e.target.value);
                  }
                }}
                placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                rows={3}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 resize-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Body (JSON ou texto)
              </label>
              <textarea
                value={typeof data.config.body === 'object' ? JSON.stringify(data.config.body, null, 2) : data.config.body || ''}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    handleConfigChange('body', parsed);
                  } catch {
                    handleConfigChange('body', e.target.value);
                  }
                }}
                placeholder='{"key": "value"} ou texto simples'
                rows={3}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 resize-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Timeout (segundos)
              </label>
              <input
                type="number"
                value={data.config.timeout || 30}
                onChange={(e) => handleConfigChange('timeout', parseInt(e.target.value) || 30)}
                placeholder="30"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Salvar resposta como variável
              </label>
              <input
                type="text"
                value={data.config.saveResponseAs || ''}
                onChange={(e) => handleConfigChange('saveResponseAs', e.target.value)}
                placeholder="ex: httpResponse"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
          </div>
        );

      case 'AI':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Provedor
              </label>
              <select
                value={data.config.provider || 'OPENAI'}
                onChange={(e) => handleConfigChange('provider', e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              >
                <option value="OPENAI">OpenAI</option>
                <option value="GEMINI">Gemini</option>
                <option value="ANTHROPIC">Anthropic</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Modelo
              </label>
              <input
                type="text"
                value={data.config.model || 'gpt-4'}
                onChange={(e) => handleConfigChange('model', e.target.value)}
                placeholder="gpt-4, gemini-pro, claude-3-opus"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                System Prompt (opcional)
              </label>
              <textarea
                value={data.config.systemPrompt || ''}
                onChange={(e) => handleConfigChange('systemPrompt', e.target.value)}
                placeholder="Você é um assistente útil..."
                rows={2}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                User Prompt *
              </label>
              <textarea
                value={data.config.userPrompt || ''}
                onChange={(e) => handleConfigChange('userPrompt', e.target.value)}
                placeholder="Responda: {{userQuestion}}"
                rows={2}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Temperature
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={data.config.temperature ?? 0.7}
                  onChange={(e) => handleConfigChange('temperature', parseFloat(e.target.value) || 0.7)}
                  placeholder="0.7"
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max Tokens
                </label>
                <input
                  type="number"
                  value={data.config.maxTokens || 1000}
                  onChange={(e) => handleConfigChange('maxTokens', parseInt(e.target.value) || 1000)}
                  placeholder="1000"
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Variáveis de contexto (separadas por vírgula)
              </label>
              <input
                type="text"
                value={Array.isArray(data.config.contextVariables) ? data.config.contextVariables.join(', ') : data.config.contextVariables || ''}
                onChange={(e) => {
                  const vars = e.target.value.split(',').map(v => v.trim()).filter(v => v);
                  handleConfigChange('contextVariables', vars);
                }}
                placeholder="nome, telefone, email"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Salvar resposta como variável
              </label>
              <input
                type="text"
                value={data.config.saveResponseAs || ''}
                onChange={(e) => handleConfigChange('saveResponseAs', e.target.value)}
                placeholder="ex: aiResponse"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>

            {/* Configuração de Classificação */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Modo de Classificação
              </label>
              <select
                value={data.config.classificationMode || 'NONE'}
                onChange={(e) => handleConfigChange('classificationMode', e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              >
                <option value="NONE">Nenhum</option>
                <option value="SENTIMENT">Sentimento</option>
                <option value="KEYWORDS">Palavras-chave</option>
                <option value="CUSTOM">Customizado</option>
              </select>

              {/* Configuração de Sentimento */}
              {data.config.classificationMode === 'SENTIMENT' && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Threshold (0-1)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={data.config.classificationConfig?.sentimentThreshold ?? 0.7}
                      onChange={(e) => {
                        const config = data.config.classificationConfig || {};
                        handleConfigChange('classificationConfig', {
                          ...config,
                          sentimentThreshold: parseFloat(e.target.value) || 0.7,
                        });
                      }}
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Palavras Positivas (separadas por vírgula)
                    </label>
                    <input
                      type="text"
                      value={Array.isArray(data.config.classificationConfig?.positiveKeywords) 
                        ? data.config.classificationConfig.positiveKeywords.join(', ') 
                        : ''}
                      onChange={(e) => {
                        const config = data.config.classificationConfig || {};
                        const keywords = e.target.value.split(',').map(k => k.trim()).filter(k => k);
                        handleConfigChange('classificationConfig', {
                          ...config,
                          positiveKeywords: keywords,
                        });
                      }}
                      placeholder="sim, ok, positivo, bom"
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Palavras Negativas (separadas por vírgula)
                    </label>
                    <input
                      type="text"
                      value={Array.isArray(data.config.classificationConfig?.negativeKeywords) 
                        ? data.config.classificationConfig.negativeKeywords.join(', ') 
                        : ''}
                      onChange={(e) => {
                        const config = data.config.classificationConfig || {};
                        const keywords = e.target.value.split(',').map(k => k.trim()).filter(k => k);
                        handleConfigChange('classificationConfig', {
                          ...config,
                          negativeKeywords: keywords,
                        });
                      }}
                      placeholder="não, ruim, negativo, cancelar"
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* Configuração de Palavras-chave */}
              {data.config.classificationMode === 'KEYWORDS' && (
                <div className="mt-2 space-y-2">
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Configure rotas baseadas em palavras-chave. Cada rota terá um label que deve corresponder ao label da aresta (edge).
                  </div>
                  {Array.isArray(data.config.classificationConfig?.keywordRoutes) &&
                    data.config.classificationConfig.keywordRoutes.map((route: any, index: number) => (
                      <div key={index} className="p-2 border border-gray-200 dark:border-gray-700 rounded">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            Rota {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const config = data.config.classificationConfig || {};
                              const routes = [...(config.keywordRoutes || [])];
                              routes.splice(index, 1);
                              handleConfigChange('classificationConfig', {
                                ...config,
                                keywordRoutes: routes,
                              });
                            }}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Remover
                          </button>
                        </div>
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={route.routeLabel || ''}
                            onChange={(e) => {
                              const config = data.config.classificationConfig || {};
                              const routes = [...(config.keywordRoutes || [])];
                              routes[index] = { ...routes[index], routeLabel: e.target.value };
                              handleConfigChange('classificationConfig', {
                                ...config,
                                keywordRoutes: routes,
                              });
                            }}
                            placeholder="Label da rota (ex: sim, não, duvida)"
                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
                          />
                          <input
                            type="text"
                            value={Array.isArray(route.keywords) ? route.keywords.join(', ') : ''}
                            onChange={(e) => {
                              const config = data.config.classificationConfig || {};
                              const routes = [...(config.keywordRoutes || [])];
                              const keywords = e.target.value.split(',').map(k => k.trim()).filter(k => k);
                              routes[index] = { ...routes[index], keywords };
                              handleConfigChange('classificationConfig', {
                                ...config,
                                keywordRoutes: routes,
                              });
                            }}
                            placeholder="Palavras-chave (separadas por vírgula)"
                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    ))}
                  <button
                    type="button"
                    onClick={() => {
                      const config = data.config.classificationConfig || {};
                      handleConfigChange('classificationConfig', {
                        ...config,
                        keywordRoutes: [...(config.keywordRoutes || []), { keywords: [], routeLabel: '' }],
                      });
                    }}
                    className="w-full text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300"
                  >
                    + Adicionar Rota
                  </button>
                </div>
              )}

              {/* Configuração Customizada */}
              {data.config.classificationMode === 'CUSTOM' && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Prompt de Classificação
                  </label>
                  <textarea
                    value={data.config.classificationConfig?.customPrompt || ''}
                    onChange={(e) => {
                      const config = data.config.classificationConfig || {};
                      handleConfigChange('classificationConfig', {
                        ...config,
                        customPrompt: e.target.value,
                      });
                    }}
                    placeholder="Ex: Classifique a resposta como 'sim', 'não' ou 'duvida' baseado no conteúdo..."
                    rows={3}
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 resize-none"
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    A IA retornará apenas o label da classificação. Certifique-se de que as arestas (edges) tenham labels correspondentes.
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'CONDITION':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Variável
              </label>
              <input
                type="text"
                value={data.config.condition?.variable || ''}
                onChange={(e) =>
                  handleConfigChange('condition', {
                    ...data.config.condition,
                    variable: e.target.value,
                  })
                }
                placeholder="ex: userMessage"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Operador
              </label>
              <select
                value={data.config.condition?.operator || 'EQUALS'}
                onChange={(e) =>
                  handleConfigChange('condition', {
                    ...data.config.condition,
                    operator: e.target.value,
                  })
                }
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              >
                <option value="EQUALS">Igual a</option>
                <option value="CONTAINS">Contém</option>
                <option value="GREATER_THAN">Maior que</option>
                <option value="LESS_THAN">Menor que</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Valor
              </label>
              <input
                type="text"
                value={data.config.condition?.value || ''}
                onChange={(e) =>
                  handleConfigChange('condition', {
                    ...data.config.condition,
                    value: e.target.value,
                  })
                }
                placeholder="Valor de comparação"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800"
              />
            </div>
          </div>
        );

      case 'END':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mensagem Final (opcional)
            </label>
            <textarea
              value={data.config.message || ''}
              onChange={(e) => handleConfigChange('message', e.target.value)}
              placeholder="Mensagem de encerramento..."
              rows={2}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 resize-none"
            />
          </div>
        );

      default:
        return <div className="text-xs text-gray-500">Configuração não disponível</div>;
    }
  };

  return (
    <div
      className={`glass-effect rounded-lg border border-gray-200 dark:border-gray-700 min-w-[280px] ${
        selected ? 'ring-2 ring-primary-500' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary-500" />
      
      <div className={`${colorClass} node-header flex items-center justify-between px-2 py-1`}>
        <div className="flex items-center gap-2">
          {isExecuting || executing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Icon className="w-4 h-4" />
          )}
          <span className="text-xs font-semibold">{label}</span>
          {(isExecuting || executing) && (
            <div className="flex items-center gap-1">
              <Radio className="w-3 h-3 animate-pulse" />
              <span className="text-xs">Executando...</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/20 rounded text-yellow-600 dark:text-yellow-400">
              <span className="text-xs font-bold">{pendingCount}</span>
              <span className="text-xs">pendente{pendingCount > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {flowId && (
            <button
              onClick={() => setShowLogsModal(true)}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="Ver logs deste nó"
            >
              <FileText className="w-3 h-3" />
            </button>
          )}
          {flowId && type !== 'START' && (
            <button
              onClick={handleExecuteFromNode}
              disabled={executing}
              className="p-1 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
              title="Executar a partir deste nó"
            >
              <Play className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="node-content">
        {renderNodeContent()}
        
        {/* Logs para nó START */}
        {type === 'START' && logs.length > 0 && (
          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 max-h-32 overflow-y-auto">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Logs de Atividade:
            </div>
            <div className="space-y-1">
              {logs.slice(-5).map((log, index) => (
                <div
                  key={index}
                  className={`text-xs p-1 rounded ${
                    log.type === 'success'
                      ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                      : log.type === 'error'
                      ? 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                      : log.type === 'warning'
                      ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200'
                      : 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:bg-blue-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex-1">{log.message}</span>
                    <span className="text-xs opacity-70">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-primary-500" />
      
      {type === 'CONDITION' && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!bg-green-500 !w-3 !h-3"
            style={{ top: '50%', transform: 'translateY(-50%) translateX(50%)' }}
          />
          <Handle
            type="source"
            position={Position.Left}
            id="false"
            className="!bg-red-500 !w-3 !h-3"
            style={{ top: '50%', transform: 'translateY(-50%) translateX(-50%)' }}
          />
        </>
      )}

      {/* Modal de Logs - Renderizado via portal para aparecer acima de tudo */}
      {showLogsModal && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowLogsModal(false);
            }
          }}
        >
          <div 
            className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Logs do Nó: {label}
              </h3>
              <button
                onClick={() => setShowLogsModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum log disponível para este nó</p>
                  <p className="text-xs mt-2">Os logs aparecerão aqui quando o nó for executado</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs
                    .slice()
                    .reverse()
                    .map((log, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border ${
                          log.type === 'success'
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : log.type === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            : log.type === 'warning'
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                            : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {log.message}
                            </p>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
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

export default memo(CustomNode);

