import { useState, useEffect, useRef } from 'react';
import { useEvolutionInstanceStore, type EvolutionInstance } from '../../store/useEvolutionInstanceStore';
import { useApiKeysStore } from '../../store/useApiKeysStore';
import { useAuthStore } from '../../store/useAuthStore';
import {
  Plug,
  Plus,
  Edit2,
  Trash2,
  TestTube,
  Loader2,
  X,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  Image as ImageIcon,
  Music,
  Webhook,
  Upload,
  File,
  Radio,
  Brain,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';

export default function Integrations() {
  const {
    instances,
    loading,
    listInstances,
    createInstance,
    updateInstance,
    deleteInstance,
    testInstance,
    testSendTextMessage,
    testSendMedia,
    testSendAudio,
    testWebhook,
    testWebSocket,
  } = useEvolutionInstanceStore();

  const { user } = useAuthStore();
  const {
    keys: apiKeys,
    loading: apiKeysLoading,
    error: apiKeysError,
    getApiKeys,
    updateApiKey,
    testApiKey,
  } = useApiKeysStore();

  const [showModal, setShowModal] = useState(false);
  const [editingInstance, setEditingInstance] = useState<EvolutionInstance | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showTestModal, setShowTestModal] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [testingType, setTestingType] = useState<string | null>(null);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const logsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  // API Keys state
  const [apiKeyValues, setApiKeyValues] = useState<{
    openai: string;
    gemini: string;
    anthropic: string;
  }>({
    openai: '',
    gemini: '',
    anthropic: '',
  });
  const [showApiKeys, setShowApiKeys] = useState<{
    openai: boolean;
    gemini: boolean;
    anthropic: boolean;
  }>({
    openai: false,
    gemini: false,
    anthropic: false,
  });
  const [savingApiKey, setSavingApiKey] = useState<string | null>(null);
  const [testingApiKey, setTestingApiKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'evolution' | 'ai'>('evolution');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    instanceName: '',
    apiUrl: '',
    apiKey: '',
    integrationType: 'WEBHOOK' as 'WEBHOOK' | 'WEBSOCKET',
    websocketGlobalMode: false,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listInstances();
  }, [listInstances]);

  useEffect(() => {
    if (user?.organizationId) {
      getApiKeys(user.organizationId);
    }
  }, [user?.organizationId, getApiKeys]);

  useEffect(() => {
    if (apiKeys) {
      setApiKeyValues({
        openai: apiKeys.openai || '',
        gemini: apiKeys.gemini || '',
        anthropic: apiKeys.anthropic || '',
      });
    }
  }, [apiKeys]);

  const getStatusBadge = (status: EvolutionInstance['status']) => {
    const badges = {
      ACTIVE: {
        icon: CheckCircle2,
        color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
        label: 'Ativa',
      },
      INACTIVE: {
        icon: AlertCircle,
        color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-700',
        label: 'Inativa',
      },
      ERROR: {
        icon: XCircle,
        color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
        label: 'Erro',
      },
    };

    const badge = badges[status];
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  const handleOpenModal = (instance?: EvolutionInstance) => {
    if (instance) {
      setEditingInstance(instance);
      setFormData({
        name: instance.name,
        instanceName: instance.instanceName,
        apiUrl: instance.apiUrl,
        apiKey: instance.apiKey || '',
        integrationType: instance.integrationType || 'WEBHOOK',
        websocketGlobalMode: instance.websocketGlobalMode || false,
      });
    } else {
      setEditingInstance(null);
      setFormData({
        name: '',
        instanceName: '',
        apiUrl: '',
        apiKey: '',
        integrationType: 'WEBHOOK',
        websocketGlobalMode: false,
      });
    }
    setFormErrors({});
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingInstance(null);
    setFormData({
      name: '',
      instanceName: '',
      apiUrl: '',
      apiKey: '',
      integrationType: 'WEBHOOK',
      websocketGlobalMode: false,
    });
    setFormErrors({});
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Nome é obrigatório';
    }

    if (!formData.instanceName.trim()) {
      errors.instanceName = 'Nome da instância é obrigatório';
    }

    if (!formData.apiUrl.trim()) {
      errors.apiUrl = 'URL da API é obrigatória';
    } else {
      try {
        new URL(formData.apiUrl);
      } catch {
        errors.apiUrl = 'URL inválida';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      if (editingInstance) {
        await updateInstance(editingInstance.id, {
          name: formData.name,
          instanceName: formData.instanceName,
          apiUrl: formData.apiUrl,
          apiKey: formData.apiKey || undefined,
          integrationType: formData.integrationType,
          websocketGlobalMode: formData.websocketGlobalMode,
        });
      } else {
        await createInstance({
          name: formData.name,
          instanceName: formData.instanceName,
          apiUrl: formData.apiUrl,
          apiKey: formData.apiKey || undefined,
          integrationType: formData.integrationType,
          websocketGlobalMode: formData.websocketGlobalMode,
        });
      }
      handleCloseModal();
    } catch (error: any) {
      console.error('Erro ao salvar instância:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    try {
      setTestingId(id);
      await testInstance(id);
    } catch (error: any) {
      console.error('Erro ao testar instância:', error);
    } finally {
      setTestingId(null);
    }
  };

  const handleOpenTestModal = (id: string) => {
    setShowTestModal(id);
    setTestPhone('');
    setTestResults({});
    setTestingType(null);
    setTestLogs([]);
    setSelectedMediaFile(null);
    setSelectedAudioFile(null);
  };

  const handleCloseTestModal = () => {
    setShowTestModal(null);
    setTestPhone('');
    setTestResults({});
    setTestingType(null);
    setTestLogs([]);
    setSelectedMediaFile(null);
    setSelectedAudioFile(null);
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remover o prefixo data:image/...;base64, se existir
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleMediaFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tipo de arquivo
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        alert('Por favor, selecione um arquivo de imagem ou vídeo');
        return;
      }
      // Validar tamanho (máximo 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('O arquivo deve ter no máximo 10MB');
        return;
      }
      setSelectedMediaFile(file);
      addLog(`📎 Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    }
  };

  const handleAudioFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tipo de arquivo
      if (!file.type.startsWith('audio/')) {
        alert('Por favor, selecione um arquivo de áudio');
        return;
      }
      // Validar tamanho (máximo 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('O arquivo deve ter no máximo 10MB');
        return;
      }
      setSelectedAudioFile(file);
      addLog(`📎 Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    setTestLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  // Scroll automático para o final do textarea quando novos logs forem adicionados
  useEffect(() => {
    if (logsTextareaRef.current && testLogs.length > 0) {
      logsTextareaRef.current.scrollTop = logsTextareaRef.current.scrollHeight;
    }
  }, [testLogs]);

  const handleRunTest = async (id: string, testType: string) => {
    if (!testPhone && testType !== 'webhook' && testType !== 'websocket') {
      addLog('❌ Erro: Número de telefone não informado');
      alert('Por favor, informe o número de telefone para teste');
      return;
    }

    const testNames: Record<string, string> = {
      text: 'Mensagem de Texto',
      media: 'Mídia',
      audio: 'Áudio',
      webhook: 'Webhook',
      websocket: 'WebSocket',
    };

    try {
      setTestingType(testType);
      addLog(`🚀 Iniciando teste: ${testNames[testType] || testType}`);
      
      if (testType !== 'webhook' && testType !== 'websocket') {
        addLog(`📱 Número de telefone: ${testPhone}`);
      }

      let result: any;

      switch (testType) {
        case 'text':
          addLog('📤 Enviando requisição para endpoint de texto...');
          result = await testSendTextMessage(id, testPhone);
          break;
        case 'media':
          if (!selectedMediaFile) {
            addLog('❌ Erro: Nenhum arquivo de mídia selecionado');
            alert('Por favor, selecione um arquivo de mídia para teste');
            return;
          }
          addLog('📤 Convertendo arquivo para Base64...');
          const mediaBase64 = await convertFileToBase64(selectedMediaFile);
          addLog(`✅ Arquivo convertido (${mediaBase64.length} caracteres)`);
          addLog('📤 Enviando requisição para endpoint de mídia...');
          result = await testSendMedia(id, testPhone, mediaBase64, selectedMediaFile.type);
          break;
        case 'audio':
          if (!selectedAudioFile) {
            addLog('❌ Erro: Nenhum arquivo de áudio selecionado');
            alert('Por favor, selecione um arquivo de áudio para teste');
            return;
          }
          addLog('📤 Convertendo arquivo para Base64...');
          const audioBase64 = await convertFileToBase64(selectedAudioFile);
          addLog(`✅ Arquivo convertido (${audioBase64.length} caracteres)`);
          addLog('📤 Enviando requisição para endpoint de áudio...');
          result = await testSendAudio(id, testPhone, audioBase64, selectedAudioFile.type);
          break;
        case 'webhook':
          addLog('📤 Verificando configuração de webhook...');
          result = await testWebhook(id);
          break;
        case 'websocket':
          addLog('🔌 Conectando WebSocket e aguardando eventos...');
          addLog('⏳ Aguardando até 30 segundos por eventos...');
          result = await testWebSocket(id, 30000);
          break;
        default:
          return;
      }

      addLog(`📥 Resposta recebida - Status: ${result.status || 'N/A'}`);

      if (result.success) {
        addLog(`✅ Sucesso: ${result.message || 'Teste concluído com sucesso'}`);
        if (result.webhookUrl) {
          addLog(`🔗 Webhook URL: ${result.webhookUrl}`);
        }
        if (result.connected !== undefined) {
          addLog(result.connected 
            ? '🔌 WebSocket conectado com sucesso!' 
            : '❌ WebSocket não conectado');
        }
        if (result.eventReceived !== undefined) {
          if (testType === 'websocket') {
            if (result.eventReceived) {
              addLog(`📨 Evento recebido: ${result.lastEvent || 'desconhecido'}`);
              if (result.eventsReceived !== undefined) {
                addLog(`📊 Total de eventos recebidos: ${result.eventsReceived}`);
              }
            } else {
              addLog('⏳ Nenhum evento recebido durante o teste');
              addLog('💡 Dica: Envie uma mensagem para o WhatsApp da instância para testar a recepção');
            }
          } else {
            addLog(result.eventReceived 
              ? '📨 Evento recebido durante o teste!' 
              : '⏳ Aguardando eventos... (envie uma mensagem para testar)');
          }
        }
      } else {
        addLog(`❌ Falha: ${result.error || 'Erro desconhecido'}`);
        if (result.webhookUrl) {
          addLog(`🔗 Webhook URL configurada: ${result.webhookUrl}`);
        }
        if (result.status) {
          addLog(`📊 Status HTTP: ${result.status}`);
        }
        // Se o erro contiver detalhes adicionais (como em erro 500), exibir
        if (result.error && result.error.includes('\n\nDetalhes:')) {
          const errorParts = result.error.split('\n\nDetalhes:');
          if (errorParts.length > 1) {
            addLog(`📋 Detalhes do erro:`);
            addLog(errorParts[1]);
          }
        }
      }

      setTestResults((prev) => ({
        ...prev,
        [testType]: result,
      }));
    } catch (error: any) {
      console.error(`Erro ao executar teste ${testType}:`, error);
      const errorMessage = error.response?.data?.error || error.message || 'Erro ao executar teste';
      addLog(`❌ Erro na requisição: ${errorMessage}`);
      
      if (error.response?.status) {
        addLog(`📊 Status HTTP: ${error.response.status}`);
      }
      
      if (error.response?.data) {
        const responseData = error.response.data;
        addLog(`📄 Dados da resposta: ${JSON.stringify(responseData, null, 2)}`);
        
        // Se houver mensagem de erro mais detalhada, adicionar
        if (responseData.message || responseData.error) {
          addLog(`⚠️ Erro detalhado: ${responseData.message || responseData.error}`);
        }
      }

      setTestResults((prev) => ({
        ...prev,
        [testType]: {
          success: false,
          error: errorMessage,
        },
      }));
    } finally {
      setTestingType(null);
      addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar esta instância?')) {
      return;
    }

    try {
      setDeletingId(id);
      await deleteInstance(id);
    } catch (error: any) {
      console.error('Erro ao deletar instância:', error);
      alert(error.response?.data?.error || 'Erro ao deletar instância');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Integrações</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Gerencie suas integrações e chaves API
        </p>
      </div>

      {/* Abas */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('evolution')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'evolution'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Plug className="w-5 h-5" />
              Evolution API
            </div>
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'ai'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Chaves de IA
            </div>
          </button>
        </nav>
      </div>

      {/* Conteúdo da aba Evolution API */}
      {activeTab === 'evolution' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Instâncias Evolution API</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
                Gerencie suas instâncias do WhatsApp
              </p>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              Nova Instância
            </button>
          </div>

      {loading && instances.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : instances.length === 0 ? (
        <div className="glass-effect p-12 rounded-lg text-center">
          <Plug className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Nenhuma instância cadastrada
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Comece criando sua primeira instância da Evolution API
          </p>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium mx-auto"
          >
            <Plus className="w-4 h-4" />
            Criar Primeira Instância
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {instances.map((instance) => (
            <div
              key={instance.id}
              className="glass-effect p-6 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {instance.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {instance.instanceName}
                    {instance.connectedPhone && ` - +${instance.connectedPhone}`}
                  </p>
                  {getStatusBadge(instance.status)}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium">URL:</span> {instance.apiUrl}
                </div>
                {instance.connectedPhone && (
                  <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                    <span className="font-medium">Número conectado:</span> +{instance.connectedPhone}
                  </div>
                )}
                {instance.lastTestedAt && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium">Último teste:</span>{' '}
                    {new Date(instance.lastTestedAt).toLocaleString('pt-BR')}
                  </div>
                )}
                {instance.testResult && !instance.testResult.success && (
                  <div className="text-xs text-red-600 dark:text-red-400">
                    <span className="font-medium">Erro:</span> {instance.testResult.error}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTest(instance.id)}
                  disabled={testingId === instance.id}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {testingId === instance.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    <>
                      <TestTube className="w-4 h-4" />
                      Testar Conexão
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleOpenTestModal(instance.id)}
                  className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded transition-colors"
                  title="Testes Avançados"
                >
                  <TestTube className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleOpenModal(instance)}
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(instance.id)}
                  disabled={deletingId === instance.id}
                  className="px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 rounded transition-colors disabled:opacity-50"
                >
                  {deletingId === instance.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
        </div>
      )}

      {/* Conteúdo da aba Chaves de IA */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Chaves de IA</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
              Configure suas chaves API para usar blocos de IA nos flows
            </p>
          </div>

          <div className="glass-effect p-6 rounded-lg border border-gray-200 dark:border-gray-700">
            {apiKeysError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {apiKeysError}
              </div>
            )}

            <div className="space-y-6">
              {/* OpenAI */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">OpenAI</h3>
                    {apiKeys?.openai ? (
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded border border-green-200 dark:border-green-800">
                        Configurada
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-xs rounded border border-gray-200 dark:border-gray-700">
                        Não configurada
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={showApiKeys.openai ? 'text' : 'password'}
                      value={apiKeyValues.openai}
                      onChange={(e) => setApiKeyValues({ ...apiKeyValues, openai: e.target.value })}
                      placeholder={apiKeys?.openai ? apiKeys.openai : 'sk-...'}
                      className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKeys({ ...showApiKeys, openai: !showApiKeys.openai })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showApiKeys.openai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      if (!user?.organizationId) return;
                      setTestingApiKey('openai');
                      const result = await testApiKey(user.organizationId, 'OPENAI', apiKeyValues.openai || undefined);
                      setTestingApiKey(null);
                      if (result.success) {
                        alert('Chave testada com sucesso!');
                      } else {
                        alert(`Erro ao testar: ${result.error}`);
                      }
                    }}
                    disabled={testingApiKey === 'openai' || apiKeysLoading}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {testingApiKey === 'openai' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                    Testar
                  </button>
                  <button
                    onClick={async () => {
                      if (!user?.organizationId) return;
                      setSavingApiKey('openai');
                      try {
                        await updateApiKey(user.organizationId, 'openai', apiKeyValues.openai || null);
                        alert('Chave salva com sucesso!');
                      } catch (error: any) {
                        alert(error.response?.data?.error || 'Erro ao salvar chave');
                      } finally {
                        setSavingApiKey(null);
                      }
                    }}
                    disabled={savingApiKey === 'openai' || apiKeysLoading}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {savingApiKey === 'openai' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Salvar
                  </button>
                </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                A chave deve começar com "sk-"
              </p>
              </div>

              {/* Gemini */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Google Gemini</h3>
                    {apiKeys?.gemini ? (
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded border border-green-200 dark:border-green-800">
                        Configurada
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-xs rounded border border-gray-200 dark:border-gray-700">
                        Não configurada
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={showApiKeys.gemini ? 'text' : 'password'}
                      value={apiKeyValues.gemini}
                      onChange={(e) => setApiKeyValues({ ...apiKeyValues, gemini: e.target.value })}
                      placeholder={apiKeys?.gemini ? apiKeys.gemini : 'AIza...'}
                      className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKeys({ ...showApiKeys, gemini: !showApiKeys.gemini })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showApiKeys.gemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      if (!user?.organizationId) return;
                      setTestingApiKey('gemini');
                      const result = await testApiKey(user.organizationId, 'GEMINI', apiKeyValues.gemini || undefined);
                      setTestingApiKey(null);
                      if (result.success) {
                        alert('Chave testada com sucesso!');
                      } else {
                        alert(`Erro ao testar: ${result.error}`);
                      }
                    }}
                    disabled={testingApiKey === 'gemini' || apiKeysLoading}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {testingApiKey === 'gemini' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                    Testar
                  </button>
                  <button
                    onClick={async () => {
                      if (!user?.organizationId) return;
                      setSavingApiKey('gemini');
                      try {
                        await updateApiKey(user.organizationId, 'gemini', apiKeyValues.gemini || null);
                        alert('Chave salva com sucesso!');
                      } catch (error: any) {
                        alert(error.response?.data?.error || 'Erro ao salvar chave');
                      } finally {
                        setSavingApiKey(null);
                      }
                    }}
                    disabled={savingApiKey === 'gemini' || apiKeysLoading}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {savingApiKey === 'gemini' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Salvar
                  </button>
                </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                A chave deve começar com "AIza"
              </p>
              </div>

              {/* Anthropic */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Anthropic (Claude)</h3>
                    {apiKeys?.anthropic ? (
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded border border-green-200 dark:border-green-800">
                        Configurada
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-xs rounded border border-gray-200 dark:border-gray-700">
                        Não configurada
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={showApiKeys.anthropic ? 'text' : 'password'}
                      value={apiKeyValues.anthropic}
                      onChange={(e) => setApiKeyValues({ ...apiKeyValues, anthropic: e.target.value })}
                      placeholder={apiKeys?.anthropic ? apiKeys.anthropic : 'sk-ant-...'}
                      className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKeys({ ...showApiKeys, anthropic: !showApiKeys.anthropic })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showApiKeys.anthropic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      if (!user?.organizationId) return;
                      setTestingApiKey('anthropic');
                      const result = await testApiKey(user.organizationId, 'ANTHROPIC', apiKeyValues.anthropic || undefined);
                      setTestingApiKey(null);
                      if (result.success) {
                        alert('Chave testada com sucesso!');
                      } else {
                        alert(`Erro ao testar: ${result.error}`);
                      }
                    }}
                    disabled={testingApiKey === 'anthropic' || apiKeysLoading}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {testingApiKey === 'anthropic' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                    Testar
                  </button>
                  <button
                    onClick={async () => {
                      if (!user?.organizationId) return;
                      setSavingApiKey('anthropic');
                      try {
                        await updateApiKey(user.organizationId, 'anthropic', apiKeyValues.anthropic || null);
                        alert('Chave salva com sucesso!');
                      } catch (error: any) {
                        alert(error.response?.data?.error || 'Erro ao salvar chave');
                      } finally {
                        setSavingApiKey(null);
                      }
                    }}
                    disabled={savingApiKey === 'anthropic' || apiKeysLoading}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {savingApiKey === 'anthropic' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Salvar
                  </button>
                </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                A chave deve começar com "sk-ant-"
              </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação/Edição */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {editingInstance ? 'Editar Instância' : 'Nova Instância'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nome Amigável *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 ${
                    formErrors.name
                      ? 'border-red-300 dark:border-red-700'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="ex: WhatsApp Marketing"
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tipo de Integração *
                </label>
                <select
                  value={formData.integrationType}
                  onChange={(e) => setFormData({ ...formData, integrationType: e.target.value as 'WEBHOOK' | 'WEBSOCKET' })}
                  className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                >
                  <option value="WEBHOOK">Webhook HTTP</option>
                  <option value="WEBSOCKET">WebSocket (Socket.IO)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {formData.integrationType === 'WEBHOOK' 
                    ? 'Recebe eventos via HTTP POST (requer configuração de webhook na Evolution API)'
                    : 'Recebe eventos em tempo real via WebSocket (conexão persistente)'}
                </p>
              </div>

              {formData.integrationType === 'WEBSOCKET' && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <input
                      type="checkbox"
                      checked={formData.websocketGlobalMode}
                      onChange={(e) => setFormData({ ...formData, websocketGlobalMode: e.target.checked })}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    Modo Global (Global Mode)
                  </label>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Se ativado, recebe eventos de todas as instâncias. Se desativado, recebe apenas eventos desta instância específica.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nome da Instância (ID) *
                </label>
                <input
                  type="text"
                  value={formData.instanceName}
                  onChange={(e) => setFormData({ ...formData, instanceName: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 ${
                    formErrors.instanceName
                      ? 'border-red-300 dark:border-red-700'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="ex: minha-instancia"
                />
                {formErrors.instanceName && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {formErrors.instanceName}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  ID da instância configurada na Evolution API
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  URL da Evolution API *
                </label>
                <input
                  type="text"
                  value={formData.apiUrl}
                  onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 ${
                    formErrors.apiUrl
                      ? 'border-red-300 dark:border-red-700'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="https://api.evolution-api.com"
                />
                {formErrors.apiUrl && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.apiUrl}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API Key (opcional)
                </label>
                <input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  placeholder="Sua API Key da Evolution API"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Deixe em branco se não usar autenticação por API Key
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancelar
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
                  'Salvar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Testes Avançados */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Testes Avançados - Evolution API
              </h2>
              <button
                onClick={handleCloseTestModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Campo de telefone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Número de Telefone para Teste *
                </label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  placeholder="5511999999999"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Formato: código do país + DDD + número (ex: 5511999999999)
                </p>
              </div>

              {/* Testes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Teste de Mensagem de Texto */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        Mensagem de Texto
                      </h3>
                    </div>
                    <button
                      onClick={() => handleRunTest(showTestModal, 'text')}
                      disabled={!testPhone || testingType === 'text'}
                      className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testingType === 'text' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Testar'
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    Envia uma mensagem de texto de teste
                  </p>
                  {testResults.text && (
                    <div
                      className={`mt-2 p-2 rounded text-xs ${
                        testResults.text.success
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {testResults.text.success ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {testResults.text.message || 'Sucesso'}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {testResults.text.error || 'Erro'}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Teste de Mídia */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ImageIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Mídia</h3>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    Envia uma imagem ou vídeo de teste
                  </p>
                  
                  {/* Seleção de arquivo */}
                  <div className="mb-2">
                    <input
                      ref={mediaFileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleMediaFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => mediaFileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      {selectedMediaFile ? selectedMediaFile.name : 'Selecionar Arquivo'}
                    </button>
                    {selectedMediaFile && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <File className="w-3 h-3" />
                        <span>{(selectedMediaFile.size / 1024).toFixed(2)} KB</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMediaFile(null);
                            if (mediaFileInputRef.current) {
                              mediaFileInputRef.current.value = '';
                            }
                          }}
                          className="ml-auto text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleRunTest(showTestModal, 'media')}
                    disabled={!testPhone || !selectedMediaFile || testingType === 'media'}
                    className="w-full px-3 py-1.5 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingType === 'media' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
                        Testando...
                      </>
                    ) : (
                      'Testar'
                    )}
                  </button>

                  {testResults.media && (
                    <div
                      className={`mt-2 p-2 rounded text-xs ${
                        testResults.media.success
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {testResults.media.success ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {testResults.media.message || 'Sucesso'}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {testResults.media.error || 'Erro'}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Teste de Áudio */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Music className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Áudio</h3>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    Envia um áudio de teste
                  </p>
                  
                  {/* Seleção de arquivo */}
                  <div className="mb-2">
                    <input
                      ref={audioFileInputRef}
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => audioFileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      {selectedAudioFile ? selectedAudioFile.name : 'Selecionar Arquivo'}
                    </button>
                    {selectedAudioFile && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <File className="w-3 h-3" />
                        <span>{(selectedAudioFile.size / 1024).toFixed(2)} KB</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAudioFile(null);
                            if (audioFileInputRef.current) {
                              audioFileInputRef.current.value = '';
                            }
                          }}
                          className="ml-auto text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleRunTest(showTestModal, 'audio')}
                    disabled={!testPhone || !selectedAudioFile || testingType === 'audio'}
                    className="w-full px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingType === 'audio' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
                        Testando...
                      </>
                    ) : (
                      'Testar'
                    )}
                  </button>

                  {testResults.audio && (
                    <div
                      className={`mt-2 p-2 rounded text-xs ${
                        testResults.audio.success
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {testResults.audio.success ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {testResults.audio.message || 'Sucesso'}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {testResults.audio.error || 'Erro'}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Teste de Webhook */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Webhook className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">Webhook</h3>
                    </div>
                    <button
                      onClick={() => handleRunTest(showTestModal, 'webhook')}
                      disabled={testingType === 'webhook'}
                      className="px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testingType === 'webhook' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Testar'
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    Verifica configuração de webhook
                  </p>
                  {testResults.webhook && (
                    <div
                      className={`mt-2 p-2 rounded text-xs ${
                        testResults.webhook.success
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {testResults.webhook.success ? (
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {testResults.webhook.message || 'Sucesso'}
                          </div>
                          {testResults.webhook.webhookUrl && (
                            <div className="text-xs mt-1 break-all">
                              URL: {testResults.webhook.webhookUrl}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <XCircle className="w-3 h-3" />
                            {testResults.webhook.error || 'Erro'}
                          </div>
                          {testResults.webhook.webhookUrl && (
                            <div className="text-xs mt-1 break-all text-gray-600 dark:text-gray-400">
                              URL configurada: {testResults.webhook.webhookUrl}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Teste de WebSocket */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Radio className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">WebSocket</h3>
                    </div>
                    <button
                      onClick={() => handleRunTest(showTestModal, 'websocket')}
                      disabled={testingType === 'websocket'}
                      className="px-3 py-1.5 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testingType === 'websocket' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Testar'
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    Testa conexão WebSocket e escuta eventos em tempo real
                  </p>
                  {testResults.websocket && (
                    <div
                      className={`mt-2 p-2 rounded text-xs ${
                        testResults.websocket.success
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {testResults.websocket.success ? (
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {testResults.websocket.message || 'Sucesso'}
                          </div>
                          {testResults.websocket.connected !== undefined && (
                            <div className="text-xs mt-1">
                              Status: {testResults.websocket.connected ? 'Conectado' : 'Desconectado'}
                            </div>
                          )}
                          {testResults.websocket.eventReceived && (
                            <div className="text-xs mt-1">
                              Evento: {testResults.websocket.lastEvent || 'recebido'}
                              {testResults.websocket.eventsReceived !== undefined && testResults.websocket.eventsReceived > 1 && (
                                <span> ({testResults.websocket.eventsReceived} eventos)</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {testResults.websocket.error || 'Erro'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Área de Logs */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Logs Detalhados
                  </label>
                  {testLogs.length > 0 && (
                    <button
                      onClick={() => setTestLogs([])}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      Limpar Logs
                    </button>
                  )}
                </div>
                <textarea
                  ref={logsTextareaRef}
                  readOnly
                  value={testLogs.join('\n')}
                  className="w-full h-48 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-gray-100 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Os logs dos testes aparecerão aqui..."
                />
                {testLogs.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {testLogs.length} linha(s) de log
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleCloseTestModal}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
