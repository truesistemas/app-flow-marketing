import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { Plus, Search, Workflow, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface Flow {
  id: string;
  name: string;
  description?: string;
  triggerKeyword?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    executions: number;
  };
}

export default function FlowList() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deletingFlowId, setDeletingFlowId] = useState<string | null>(null);

  useEffect(() => {
    loadFlows();
  }, []);

  const loadFlows = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ flows: Flow[] }>('/api/flows');
      setFlows(response.data.flows || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar flows');
    } finally {
      setLoading(false);
    }
  };

  const filteredFlows = flows.filter((flow) =>
    flow.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDeleteFlow = async (flowId: string, flowName: string, deleteExecutions: boolean = false) => {
    const confirmMessage = deleteExecutions
      ? `Tem certeza que deseja deletar o flow "${flowName}"?\n\nIsso também irá cancelar todas as execuções ativas deste flow.\n\nEsta ação não pode ser desfeita.`
      : `Tem certeza que deseja deletar o flow "${flowName}"?\n\nEsta ação não pode ser desfeita.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setDeletingFlowId(flowId);
      
      // Se optou por deletar execuções, adicionar query param
      const url = deleteExecutions 
        ? `/api/flows/${flowId}?deleteExecutions=true`
        : `/api/flows/${flowId}`;
      
      await api.delete(url);
      
      // Remover flow da lista
      setFlows(flows.filter(flow => flow.id !== flowId));
      
      // Mostrar mensagem de sucesso
      alert('Flow deletado com sucesso!');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Erro ao deletar flow';
      const errorReason = err.response?.data?.reason;
      const activeExecutionsCount = err.response?.data?.activeExecutionsCount;
      const canDeleteExecutions = err.response?.data?.canDeleteExecutions;
      
      if (errorReason === 'active_campaigns' || errorReason === 'campaigns_using') {
        const campaigns = err.response?.data?.campaigns || [];
        const campaignsList = campaigns.map((c: any) => `- ${c.name}`).join('\n');
        alert(`${errorMessage}\n\nCampanhas usando este flow:\n${campaignsList}\n\nRemova o flow das campanhas antes de deletar.`);
      } else if (errorReason === 'active_executions' && canDeleteExecutions) {
        // Oferecer opção de deletar execuções ativas
        const deleteExecutionsConfirm = window.confirm(
          `${errorMessage}\n\nDeseja cancelar e deletar as ${activeExecutionsCount} execução(ões) ativa(s) e depois deletar o flow?`
        );
        
        if (deleteExecutionsConfirm) {
          // Tentar novamente com deleteExecutions=true
          await handleDeleteFlow(flowId, flowName, true);
        }
      } else if (errorReason === 'active_executions') {
        alert(errorMessage);
      } else {
        alert(errorMessage);
      }
    } finally {
      setDeletingFlowId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Flows</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Gerencie seus flows de automação
          </p>
        </div>
        <Link
          to="/flows/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Novo Flow
        </Link>
      </div>

      {/* Busca */}
      <div className="glass-effect p-4 rounded-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar flows..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Lista de Flows */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {!loading && !error && filteredFlows.length === 0 && (
        <div className="text-center py-12">
          <Workflow className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {search ? 'Nenhum flow encontrado' : 'Nenhum flow criado ainda'}
          </p>
          {!search && (
            <Link
              to="/flows/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Criar Primeiro Flow
            </Link>
          )}
        </div>
      )}

      {!loading && !error && filteredFlows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFlows.map((flow) => (
            <div
              key={flow.id}
              className="glass-effect rounded-lg p-6 hover:shadow-lg transition-all relative group"
            >
              <Link
                to={`/flows/${flow.id}`}
                className="block"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      {flow.name}
                    </h3>
                    {flow.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {flow.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      flow.isActive
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {flow.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  {flow.triggerKeyword && (
                    <div>
                      <span className="font-medium">Palavra-chave:</span>{' '}
                      <span className="text-primary-600 dark:text-primary-400">
                        {flow.triggerKeyword}
                      </span>
                    </div>
                  )}
                  {flow._count && (
                    <div>
                      <span className="font-medium">Execuções:</span> {flow._count.executions}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    Atualizado em {new Date(flow.updatedAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </Link>

              {/* Botão de deletar */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteFlow(flow.id, flow.name);
                }}
                disabled={deletingFlowId === flow.id}
                className="absolute top-4 right-4 p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Deletar flow"
              >
                {deletingFlowId === flow.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}






