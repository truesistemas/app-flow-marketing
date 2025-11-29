import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Users, Send, CheckCircle, Eye, MessageSquare, AlertCircle, RotateCcw } from 'lucide-react';

interface CampaignStatsProps {
  campaignId: string;
}

interface Stats {
  totalLeads: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  error: number;
  leadsByStatus?: Record<string, number>;
}

export default function CampaignStats({ campaignId }: CampaignStatsProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await api.get<{ stats: Stats }>(`/api/campaigns/${campaignId}/stats`);
        setStats(response.data.stats);
      } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 5000); // Atualizar a cada 5 segundos

    return () => clearInterval(interval);
  }, [campaignId]);

  const handleResetLeads = async () => {
    if (resetting) return;
    if (!window.confirm('Tem certeza que deseja resetar o status de envio de todos os leads desta campanha?')) {
      return;
    }

    try {
      setResetting(true);
      await api.post(`/api/campaigns/${campaignId}/reset-leads-status`);
      // Recarregar estatísticas após reset
      const response = await api.get<{ stats: Stats }>(`/api/campaigns/${campaignId}/stats`);
      setStats(response.data.stats);
    } catch (error: any) {
      console.error('Erro ao resetar status dos leads:', error);
      alert(error.response?.data?.error || 'Erro ao resetar status dos leads da campanha');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-effect p-6 rounded-lg">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const progress = stats.totalLeads > 0 ? Math.round((stats.sent / stats.totalLeads) * 100) : 0;

  return (
    <div className="glass-effect p-6 rounded-lg">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          Estatísticas da Campanha
        </h3>
        <button
          type="button"
          onClick={handleResetLeads}
          disabled={resetting}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          <RotateCcw className="w-3 h-3" />
          {resetting ? 'Resetando...' : 'Resetar status de leads'}
        </button>
      </div>

      {/* Progress Bar */}
      {stats.totalLeads > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Progresso de Envio</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className="bg-primary-600 h-3 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.totalLeads}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Total de Leads</div>
        </div>

        <div className="text-center">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Send className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.sent}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Enviados</div>
        </div>

        <div className="text-center">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
            <CheckCircle className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.delivered}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Entregues</div>
        </div>

        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Eye className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.read}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Lidos</div>
        </div>

        <div className="text-center">
          <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
            <MessageSquare className="w-6 h-6 text-pink-600 dark:text-pink-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.replied}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Responderam</div>
        </div>

        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.error}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Erros</div>
        </div>
      </div>
    </div>
  );
}






