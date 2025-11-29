import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCampaignStore } from '../../store/useCampaignStore';
import { useEvolutionInstanceStore } from '../../store/useEvolutionInstanceStore';
import api from '../../services/api';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import CampaignLeadsManager from '../../components/campaigns/CampaignLeadsManager';
import MessageEditor from '../../components/campaigns/MessageEditor';
import type { CampaignMessageContent } from '../../types/campaign';

const campaignSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  description: z.string().optional(),
  flowId: z.string().optional(), // Flow opcional na edição
  instanceId: z.string().min(1, 'Selecione uma instância'),
  scheduledAt: z.string().optional(),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

const steps = [
  { id: 1, name: 'Informações', description: 'Dados básicos da campanha' },
  { id: 2, name: 'Flow', description: 'Selecione o flow' },
  { id: 3, name: 'Conteúdo', description: 'Mensagem da campanha' },
  { id: 4, name: 'Instância', description: 'Configuração da Evolution API' },
  { id: 5, name: 'Contatos', description: 'Gerenciar contatos' },
  { id: 6, name: 'Revisão', description: 'Confirme os dados' },
];

export default function CampaignEdit() {
  const { id } = useParams<{ id: string }>();
  const [currentStep, setCurrentStep] = useState(1);
  const [flows, setFlows] = useState<any[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [messageContent, setMessageContent] = useState<CampaignMessageContent | undefined>();
  const navigate = useNavigate();
  const { updateCampaign, fetchCampaign, currentCampaign } = useCampaignStore();
  const { instances, listInstances, loading: loadingInstances } = useEvolutionInstanceStore();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    mode: 'onChange',
  });

  // Carregar campanha e flows
  useEffect(() => {
    if (!id) {
      navigate('/campaigns');
      return;
    }

    const loadData = async () => {
      setLoadingCampaign(true);
      try {
        await fetchCampaign(id);
        setLoadingFlows(true);
        const flowsResponse = await api.get('/api/flows');
        setFlows(flowsResponse.data.flows || []);
        setLoadingFlows(false);
        listInstances();
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        navigate('/campaigns');
      } finally {
        setLoadingCampaign(false);
      }
    };

    loadData();
  }, [id, navigate, fetchCampaign, listInstances]);

  // Preencher formulário quando campanha for carregada
  useEffect(() => {
    if (currentCampaign && id === currentCampaign.id) {
      reset({
        name: currentCampaign.name,
        description: currentCampaign.description || '',
        flowId: currentCampaign.flowId || '',
        instanceId: (currentCampaign as any).instanceId || '',
        scheduledAt: currentCampaign.scheduledAt
          ? new Date(currentCampaign.scheduledAt).toISOString().slice(0, 16)
          : '',
      });
      // Carregar messageContent se existir
      if ((currentCampaign as any).messageContent) {
        setMessageContent((currentCampaign as any).messageContent);
      }
    }
  }, [currentCampaign, id, reset]);

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
    if (!id) return;

    try {
      await updateCampaign(id, {
        name: data.name,
        description: data.description,
        flowId: data.flowId,
        instanceId: data.instanceId,
        scheduledAt: data.scheduledAt,
        messageContent: messageContent,
      });

      navigate(`/campaigns/${id}`);
    } catch (error: any) {
      console.error('Erro ao atualizar campanha:', error);
      const errorMessage =
        error.response?.data?.error || error.message || 'Erro ao atualizar campanha';
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
                Descrição
              </label>
              <textarea
                {...register('description')}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                placeholder="Descreva o objetivo da campanha..."
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Selecione o Flow *
              </label>
              {loadingFlows ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : (
                <select
                  {...register('flowId')}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Selecione um flow</option>
                  {flows.map((flow) => (
                    <option key={flow.id} value={flow.id}>
                      {flow.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.flowId && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.flowId.message}
                </p>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <MessageEditor
              value={messageContent}
              onChange={(content) => {
                setMessageContent(content);
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
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Instância Evolution API *
              </label>
              {loadingInstances ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : instances.length === 0 ? (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                    Nenhuma instância cadastrada.
                  </p>
                  <Link
                    to="/settings/integrations"
                    className="text-sm text-yellow-600 dark:text-yellow-400 hover:underline"
                  >
                    Cadastrar instância →
                  </Link>
                </div>
              ) : (
                <select
                  {...register('instanceId')}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Selecione uma instância</option>
                  {instances
                    .filter((inst) => inst.status === 'ACTIVE')
                    .map((instance) => (
                      <option key={instance.id} value={instance.id}>
                        {instance.name} ({instance.instanceName})
                      </option>
                    ))}
                </select>
              )}
              {errors.instanceId && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.instanceId.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data e Hora de Agendamento (opcional)
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
            {id && <CampaignLeadsManager campaignId={id} />}
          </div>
        );

      case 6:
        const formData = watch();
        const selectedFlow = flows.find((f) => f.id === formData.flowId);
        const selectedInstance = instances.find((i) => i.id === formData.instanceId);

        return (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Resumo da Campanha
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Nome:</span>{' '}
                  <span className="text-gray-600 dark:text-gray-400">{formData.name}</span>
                </div>
                {formData.description && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Descrição:
                    </span>{' '}
                    <span className="text-gray-600 dark:text-gray-400">
                      {formData.description}
                    </span>
                  </div>
                )}
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Flow:</span>{' '}
                  <span className="text-gray-600 dark:text-gray-400">
                    {selectedFlow?.name || 'Não selecionado'}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Instância:
                  </span>{' '}
                  <span className="text-gray-600 dark:text-gray-400">
                    {selectedInstance?.name || 'Não selecionada'}
                  </span>
                </div>
                {formData.scheduledAt && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Agendamento:
                    </span>{' '}
                    <span className="text-gray-600 dark:text-gray-400">
                      {new Date(formData.scheduledAt).toLocaleString('pt-BR')}
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

  if (loadingCampaign) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Editar Campanha
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Atualize as informações da campanha
          </p>
        </div>
        <Link
          to={`/campaigns/${id}`}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Voltar
        </Link>
      </div>

      {/* Steps */}
      <div className="glass-effect rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    currentStep >= step.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {step.id}
                </div>
                <div className="mt-2 text-center">
                  <p
                    className={`text-sm font-medium ${
                      currentStep >= step.id
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {step.name}
                  </p>
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

        <div>
          <div className="min-h-[300px]">{renderStepContent()}</div>

          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Anterior
              </button>
            ) : (
              <div />
            )}

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
                onClick={async (e) => {
                  e.preventDefault();
                  const isValid = await trigger();
                  if (!isValid) {
                    alert('Por favor, preencha todos os campos obrigatórios');
                    return;
                  }
                  const formData = watch();
                  await onSubmit(formData);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  'Atualizar Campanha'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

