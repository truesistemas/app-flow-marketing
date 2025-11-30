import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Search, Users, Phone, User } from 'lucide-react';

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  customFields?: any;
  createdAt: string;
  updatedAt: string;
}

export default function ContactList() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);

  useEffect(() => {
    loadContacts();
  }, [page, search]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const response = await api.get<{
        contacts: Contact[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>(`/api/contacts?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
      
      setContacts(response.data.contacts || []);
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.total || 0);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 11) {
      return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (phone.length === 10) {
      return phone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Contatos</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Gerencie seus contatos
          </p>
        </div>
      </div>

      {/* Busca */}
      <div className="glass-effect p-4 rounded-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1); // Resetar para primeira página ao buscar
            }}
            placeholder="Buscar contatos por nome ou telefone..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Lista de Contatos */}
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

      {!loading && !error && contacts.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {search ? 'Nenhum contato encontrado' : 'Nenhum contato cadastrado ainda'}
          </p>
        </div>
      )}

      {!loading && !error && contacts.length > 0 && (
        <>
          <div className="glass-effect rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Telefone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Cadastrado em
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {contacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                            <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {contact.name || 'Sem nome'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <Phone className="w-4 h-4 mr-2" />
                          {formatPhone(contact.phone)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(contact.createdAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginação */}
          <div className="glass-effect p-4 rounded-lg">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {total > 0 ? (
                  <>
                    Mostrando <span className="font-medium text-gray-900 dark:text-gray-100">
                      {((page - 1) * limit) + 1}
                    </span> até{' '}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {Math.min(page * limit, total)}
                    </span> de{' '}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {total}
                    </span> contato{total !== 1 ? 's' : ''}
                  </>
                ) : (
                  'Nenhum contato encontrado'
                )}
              </div>
              
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    title="Primeira página"
                  >
                    ««
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (page <= 3) {
                        pageNum = i + 1;
                      } else if (page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = page - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`px-3 py-2 rounded-lg transition-colors text-sm ${
                            page === pageNum
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Próxima
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    title="Última página"
                  >
                    »»
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

