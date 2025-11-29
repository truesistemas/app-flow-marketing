import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCampaignStore } from '../../store/useCampaignStore';
import CampaignStats from '../../components/campaigns/CampaignStats';
import { ArrowLeft, Play, Pause, Upload, Loader2, RotateCcw } from 'lucide-react';
import api from '../../services/api';
import LeadImportModal from '../../components/campaigns/LeadImportModal';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCampaign, loading, error, fetchCampaign, startCampaign, pauseCampaign } =
    useCampaignStore();
  const [showImportModal, setShowImportModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [resetFlowLoading, setResetFlowLoading] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCampaign(id);
    }
  }, [id]);

  const handleStart = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await startCampaign(id);
    } catch (error: any) {
      alert(error.message || 'Erro ao iniciar campanha');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await pauseCampaign(id);
    } catch (error: any) {
      alert(error.message || 'Erro ao pausar campanha');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetFlowExecutions = async () => {
    if (!id) return;
    if (!window.confirm('Tem certeza que deseja resetar as execuções de Flow para os leads desta campanha? Isso poderá fazer o Flow ser executado novamente para esses contatos.')) {
      return;
    }

    try {
      setResetFlowLoading(true);
      await api.post(`/api/campaigns/${id}/reset-flow-executions`);
      alert('Execuções de Flow associadas à campanha foram resetadas (quando aplicável).');
    } catch (error: any) {
      console.error('Erro ao resetar execuções de Flow da campanha:', error);
      alert(error.response?.data?.error || 'Erro ao resetar execuções de Flow da campanha');
    } finally {
      setResetFlowLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error || !currentCampaign) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 dark:text-red-400 mb-4">
          {error || 'Campanha não encontrada'}
        </p>
        <Link
          to="/campaigns"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Voltar para campanhas
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/campaigns"
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {currentCampaign.name}
            </h1>
            {currentCampaign.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {currentCampaign.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentCampaign.status === 'DRAFT' || currentCampaign.status === 'PAUSED' ? (
            <button
              onClick={handleStart}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Iniciar
            </button>
          ) : currentCampaign.status === 'RUNNING' ? (
            <button
              onClick={handlePause}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
              Pausar
            </button>
          ) : null}

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            Importar Leads
          </button>

          <button
            onClick={handleResetFlowExecutions}
            disabled={resetFlowLoading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm"
          >
            {resetFlowLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            Resetar Flows
          </button>
        </div>
      </div>

      {/* Estatísticas */}
      <CampaignStats campaignId={id!} />

      {/* Informações da Campanha */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-effect p-6 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Informações
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-400">Status:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {currentCampaign.status}
              </span>
            </div>
            {currentCampaign.flow && (
              <div>
                <span className="text-gray-600 dark:text-gray-400">Flow:</span>
                <Link
                  to={`/flows/${currentCampaign.flowId}`}
                  className="ml-2 font-medium text-primary-600 hover:text-primary-700"
                >
                  {currentCampaign.flow.name}
                </Link>
              </div>
            )}
            <div>
              <span className="text-gray-600 dark:text-gray-400">Instância:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {currentCampaign.instanceName}
              </span>
            </div>
            {currentCampaign.scheduledAt && (
              <div>
                <span className="text-gray-600 dark:text-gray-400">Agendada para:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {new Date(currentCampaign.scheduledAt).toLocaleString('pt-BR')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showImportModal && id && (
        <LeadImportModal
          campaignId={id}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            fetchCampaign(id);
          }}
        />
      )}
    </div>
  );
}






