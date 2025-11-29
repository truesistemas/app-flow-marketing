import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { Campaign } from '../../store/useCampaignStore';
import { useCampaignStore } from '../../store/useCampaignStore';
import { Calendar, Users, Workflow, Edit, Trash2, X } from 'lucide-react';

interface CampaignCardProps {
  campaign: Campaign;
}

const statusColors = {
  DRAFT: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  SCHEDULED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  RUNNING: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  PAUSED: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  COMPLETED: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  CANCELLED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

const statusLabels = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendada',
  RUNNING: 'Em Execução',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export default function CampaignCard({ campaign }: CampaignCardProps) {
  const navigate = useNavigate();
  const { deleteCampaign } = useCampaignStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const totalLeads =
    campaign.totalLeads ??
    campaign.stats?.totalLeads ??
    campaign._count?.leads ??
    0;
  const sent = campaign.stats?.sent || 0;
  const progress = totalLeads > 0 ? Math.round((sent / totalLeads) * 100) : 0;

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/campaigns/${campaign.id}/edit`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      await deleteCampaign(campaign.id);
      setShowDeleteConfirm(false);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao deletar campanha');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <div className="glass-effect rounded-lg p-6 transition-all relative group flex flex-col">

      {/* Modal de confirmação de exclusão */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Confirmar exclusão
              </h3>
              <button
                onClick={handleDeleteCancel}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Tem certeza que deseja excluir a campanha <strong>"{campaign.name}"</strong>?
              {campaign.status === 'RUNNING' && (
                <span className="block mt-2 text-red-600 dark:text-red-400 text-sm">
                  Não é possível excluir uma campanha em execução.
                </span>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeleteCancel}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting || campaign.status === 'RUNNING'}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDeleting && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      <Link
        to={`/campaigns/${campaign.id}`}
        className="block flex-1"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {campaign.name}
            </h3>
            {campaign.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {campaign.description}
              </p>
            )}
          </div>
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[campaign.status]}`}
          >
            {statusLabels[campaign.status]}
          </span>
        </div>

        <div className="space-y-3">
          {campaign.flow && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Workflow className="w-4 h-4" />
              <span>{campaign.flow.name}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Users className="w-4 h-4" />
            <span>{totalLeads} leads</span>
          </div>

          {campaign.status === 'RUNNING' && totalLeads > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                <span>Progresso</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {campaign.scheduledAt && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Calendar className="w-4 h-4" />
              <span>
                {new Date(campaign.scheduledAt).toLocaleDateString('pt-BR')}
              </span>
            </div>
          )}
        </div>
      </Link>

      {/* Botões de ação na parte inferior */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleEdit}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          title="Editar campanha"
        >
          <Edit className="w-4 h-4" />
          <span className="text-sm font-medium">Editar</span>
        </button>
        <button
          onClick={handleDeleteClick}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
          title="Excluir campanha"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-sm font-medium">Excluir</span>
        </button>
      </div>
    </div>
  );
}

