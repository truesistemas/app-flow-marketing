import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCampaignStore } from '../../store/useCampaignStore';
//import { useFlowStore } from '../../store/useFlowStore';
import { useEvolutionInstanceStore } from '../../store/useEvolutionInstanceStore';
import api from '../../services/api';
import { ArrowLeft, ArrowRight, Loader2, AlertCircle, X, Plus } from 'lucide-react';
import LeadImportStep from '../../components/campaigns/LeadImportStep';
import MessageEditor from '../../components/campaigns/MessageEditor';
import type { CampaignMessageContent } from '../../types/campaign';

const campaignSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  description: z.string().optional(),
  flowId: z.string().optional(), // Flow opcional
  instanceId: z.string().min(1, 'Selecione uma instância'),
  scheduledAt: z.string().optional(),
  messageContent: z.any().optional(),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

const steps = [
  { id: 1, name: 'Informações', description: 'Dados básicos da campanha' },
  { id: 2, name: 'Flow', description: 'Selecione o flow' },
  { id: 3, name: 'Conteúdo', description: 'Mensagem da campanha' },
  { id: 4, name: 'Instância', description: 'Configuração da Evolution API' },
  { id: 5, name: 'Leads', description: 'Importar contatos' },
  { id: 6, name: 'Revisão', description: 'Confirme os dados' },
];

export default function CampaignCreate() {
  const [currentStep, setCurrentStep] = useState(1);
  const [importedLeads, setImportedLeads] = useState<File | null>(null);
  const [flows, setFlows] = useState<any[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [messageContent, setMessageContent] = useState<CampaignMessageContent | undefined>();
  const [manualLeads, setManualLeads] = useState<Array<{ phone: string; name?: string }>>([]);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const navigate = useNavigate();
  const createCampaign = useCampaignStore((state) => state.createCampaign);
  const importLeads = useCampaignStore((state) => state.importLeads);
  const { instances, loading: loadingInstances } = useEvolutionInstanceStore();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    mode: 'onChange',
  });

  const watchedValues = watch();

  // Carregar flows ao montar componente
  useEffect(() => {
    setLoadingFlows(true);
    api
      .get('/api/flows')
      .then((response) => {
        setFlows(response.data.flows || []);
      })
      .catch((error) => {
        console.error('Erro ao carregar flows:', error);
      })
      .finally(() => {
        setLoadingFlows(false);
      });
  }, []);

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async (data: CampaignFormData) => {
    try {
      console.log('Submetendo campanha:', data);
      
      if (!data.name || !data.instanceId) {
        alert('Por favor, preencha os campos obrigatórios (Nome e Instância)');
        return;
      }

      const campaign = await createCampaign({
        ...data,
        instanceName: data.instanceId, // Manter compatibilidade temporária
        messageContent: messageContent,
      });
      console.log('Campanha criada:', campaign);
      
      // Se houver arquivo de leads, importar
      if (importedLeads) {
        console.log('Importando leads...');
        await importLeads(campaign.id, importedLeads);
      }

      // Se houver leads manuais, adicionar
      if (manualLeads.length > 0) {
        console.log('Adicionando leads manuais...');
        for (const lead of manualLeads) {
          try {
            // Criar ou buscar contato
            const contactResponse = await api.post('/api/contacts', {
              phone: lead.phone.replace(/\D/g, ''),
              name: lead.name?.trim() || undefined,
            });

            // Adicionar à campanha
            await api.post(`/api/campaigns/${campaign.id}/leads`, {
              contactId: contactResponse.data.contact.id,
            });
          } catch (error: any) {
            console.error(`Erro ao adicionar lead ${lead.phone}:`, error);
          }
        }
      }

      navigate(`/campaigns/${campaign.id}`);
    } catch (error: any) {
      console.error('Erro ao criar campanha:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Erro ao criar campanha';
      alert(errorMessage);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome da Campanha *
              </label>
              <input
                type="text"
                {...register('name')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                placeholder="Ex: Campanha Black Friday 2024"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Descrição (opcional)
              </label>
              <textarea
                {...register('description')}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 resize-none"
                placeholder="Descreva o objetivo desta campanha..."
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            {loadingFlows ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              </div>
            ) : flows.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Nenhum flow encontrado
                </p>
                <a
                  href="/flows/new"
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  Criar primeiro flow
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                {flows.map((flow) => (
                  <label
                    key={flow.id}
                    className={`block p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      watchedValues.flowId === flow.id
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <input
                      type="radio"
                      value={flow.id}
                      {...register('flowId')}
                      className="sr-only"
                    />
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {flow.name}
                    </div>
                    {flow.description && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {flow.description}
                      </div>
                    )}
                  </label>
                ))}
              </div>
            )}
            {/* Flow é opcional agora, então não exibimos erro obrigatório aqui */}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <MessageEditor
              value={messageContent}
              onChange={(content) => {
                setMessageContent(content);
                setValue('messageContent', content);
              }}
            />
            {(!messageContent || (!messageContent.text && !messageContent.mediaUrl && (!messageContent.items || messageContent.items.length === 0))) && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Por favor, adicione pelo menos um texto ou mídia ao conteúdo da campanha.
              </p>
            )}
          </div>
        );

      case 4:
        const activeInstances = instances.filter((inst) => inst.status === 'ACTIVE');
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Instância Evolution API *
              </label>
              {loadingInstances ? (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Carregando instâncias...</span>
                </div>
              ) : activeInstances.length === 0 ? (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-1">
                        Nenhuma instância ativa encontrada
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-400 mb-3">
                        Você precisa criar e testar uma instância da Evolution API antes de criar uma campanha.
                      </p>
                      <Link
                        to="/settings/integrations"
                        className="inline-flex items-center gap-2 text-xs font-medium text-yellow-800 dark:text-yellow-300 hover:underline"
                      >
                        Ir para Integrações
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <select
                    {...register('instanceId')}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Selecione uma instância</option>
                    {activeInstances.map((instance) => (
                      <option key={instance.id} value={instance.id}>
                        {instance.name} ({instance.instanceName})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Selecione uma instância ativa da Evolution API
                  </p>
                  {errors.instanceId && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.instanceId.message}
                    </p>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Agendar Campanha (opcional)
              </label>
              <input
                type="datetime-local"
                {...register('scheduledAt')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Gerenciar Leads
              </h3>
              <button
                type="button"
                onClick={() => setShowAddContactModal(true)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Adicionar Contato
              </button>
            </div>

            {/* Lista de leads manuais */}
            {manualLeads.length > 0 && (
              <div className="mb-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Contatos Adicionados Manualmente ({manualLeads.length})
                </h4>
                <div className="space-y-2">
                  {manualLeads.map((lead, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-white dark:bg-slate-700 rounded border border-gray-200 dark:border-gray-600"
                    >
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {lead.name || 'Sem nome'}
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-400 ml-2">
                          {lead.phone}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setManualLeads(manualLeads.filter((_, i) => i !== index));
                        }}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <LeadImportStep
              onFileSelected={(file) => setImportedLeads(file)}
              selectedFile={importedLeads}
            />
          </div>
        );

      case 6:
        const selectedFlow = flows.find((f) => f.id === watchedValues.flowId);
        const hasErrors = Object.keys(errors).length > 0;
        
        return (
          <div className="space-y-6">
            {hasErrors && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
                <p className="font-medium mb-2">Por favor, corrija os seguintes erros:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {errors.name && <li>{errors.name.message}</li>}
                  {errors.flowId && <li>{errors.flowId.message}</li>}
                  {errors.instanceId && <li>{errors.instanceId.message}</li>}
                </ul>
              </div>
            )}
            
            <div className="glass-effect p-6 rounded-lg">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Resumo da Campanha
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Nome:</span>
                  <span className={`ml-2 font-medium ${watchedValues.name ? 'text-gray-900 dark:text-gray-100' : 'text-red-500'}`}>
                    {watchedValues.name || 'Não preenchido'}
                  </span>
                </div>
                {watchedValues.description && (
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Descrição:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {watchedValues.description}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Flow:</span>
                  <span className={`ml-2 font-medium ${selectedFlow ? 'text-gray-900 dark:text-gray-100' : 'text-red-500'}`}>
                    {selectedFlow?.name || 'Não selecionado'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Instância:</span>
                  <span className={`ml-2 font-medium ${watchedValues.instanceId ? 'text-gray-900 dark:text-gray-100' : 'text-red-500'}`}>
                    {watchedValues.instanceId
                      ? instances.find((i) => i.id === watchedValues.instanceId)?.name || 'Não encontrada'
                      : 'Não selecionada'}
                  </span>
                </div>
                {messageContent && (
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Conteúdo:</span>
                    <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                      {messageContent.type === 'TEXT' && messageContent.text && (
                        <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                          {messageContent.text}
                        </p>
                      )}
                      {messageContent.type === 'MEDIA' && messageContent.mediaUrl && (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            {messageContent.mediaType}
                          </p>
                          {messageContent.caption && (
                            <p className="text-sm text-gray-900 dark:text-gray-100">
                              {messageContent.caption}
                            </p>
                          )}
                        </div>
                      )}
                      {messageContent.type === 'MULTI' && messageContent.items && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {messageContent.items.length} bloco(s) de conteúdo
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {importedLeads && (
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Arquivo de Leads:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {importedLeads.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/campaigns')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Nova Campanha
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Crie uma nova campanha de marketing
          </p>
        </div>
      </div>

      {/* Steps Indicator */}
      <div className="glass-effect p-4 rounded-lg">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                    currentStep >= step.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {step.id}
                </div>
                <div className="mt-2 text-center">
                  <div
                    className={`text-xs font-medium ${
                      currentStep >= step.id
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {step.name}
                  </div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-1 flex-1 mx-2 ${
                    currentStep > step.id
                      ? 'bg-primary-600'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="glass-effect p-6 rounded-lg min-h-[400px]">
          {renderStepContent()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
            Anterior
          </button>

          {currentStep < steps.length ? (
            <button
              type="button"
              onClick={nextStep}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              Próximo
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                // Validar todos os campos antes de submeter
                const isValid = await trigger();
                if (!isValid) {
                  console.error('Formulário inválido:', errors);
                  // Voltar para o primeiro step com erro
                  if (errors.name) {
                    setCurrentStep(1);
                    alert('Por favor, preencha o nome da campanha');
                  } else if (errors.instanceId) {
                    setCurrentStep(4);
                    alert('Por favor, selecione uma instância');
                  }
                  return;
                }
                
                // Se válido, submeter o formulário
                const formData = watch();
                await onSubmit(formData);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Campanha'
              )}
            </button>
          )}
        </div>
      </form>

      {/* Modal de adicionar contato */}
      {showAddContactModal && (
        <AddContactModalForCreate
          onClose={() => setShowAddContactModal(false)}
          onAdd={(lead) => {
            setManualLeads([...manualLeads, lead]);
            setShowAddContactModal(false);
          }}
        />
      )}
    </div>
  );
}

// Modal para adicionar contato na criação
function AddContactModalForCreate({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (lead: { phone: string; name?: string }) => void;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      alert('Telefone é obrigatório');
      return;
    }

    onAdd({
      phone: phone.replace(/\D/g, ''),
      name: name.trim() || undefined,
    });
    setPhone('');
    setName('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Adicionar Contato
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Telefone *
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5511999999999"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome (opcional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do contato"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

