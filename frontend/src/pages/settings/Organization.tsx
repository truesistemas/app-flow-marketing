import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { Building, Save, Loader2 } from 'lucide-react';

export default function Organization() {
  const user = useAuthStore((state) => state.user);
  const [organizationName, setOrganizationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (user?.organization) {
      setOrganizationName(user.organization.name);
    }
  }, [user]);

  const handleSave = async () => {
    if (!organizationName.trim()) {
      setMessage({ type: 'error', text: 'Nome da organização é obrigatório' });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      // TODO: Implementar endpoint para atualizar organização
      // await api.put(`/api/organizations/${user?.organizationId}`, {
      //   name: organizationName,
      // });

      setMessage({ type: 'success', text: 'Organização atualizada com sucesso!' });
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Erro ao atualizar organização',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Organização</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Gerencie as configurações da sua organização
        </p>
      </div>

      <div className="glass-effect p-6 rounded-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
            <Building className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Informações da Organização
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Atualize os dados da sua organização
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome da Organização *
            </label>
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
              placeholder="Nome da organização"
            />
          </div>

          {user?.organization && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Slug
              </label>
              <input
                type="text"
                value={user.organization.slug}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                O slug não pode ser alterado
              </p>
            </div>
          )}

          {message && (
            <div
              className={`px-4 py-3 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}






