import { create } from 'zustand';
import api from '../services/api';

export type IntegrationType = 'WEBHOOK' | 'WEBSOCKET';

export interface EvolutionInstance {
  id: string;
  name: string;
  instanceName: string;
  apiUrl: string;
  apiKey?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  connectedPhone?: string;
  lastTestedAt?: string;
  testResult?: {
    success: boolean;
    status?: number;
    message?: string;
    version?: string;
    error?: string;
  };
  integrationType?: IntegrationType;
  websocketGlobalMode?: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstanceData {
  name: string;
  instanceName: string;
  apiUrl: string;
  apiKey?: string;
  integrationType?: IntegrationType;
  websocketGlobalMode?: boolean;
}

export interface UpdateInstanceData {
  name?: string;
  instanceName?: string;
  apiUrl?: string;
  apiKey?: string;
  integrationType?: IntegrationType;
  websocketGlobalMode?: boolean;
}

export interface TestResult {
  success: boolean;
  status?: number;
  message?: string;
  version?: string;
  error?: string;
  webhookUrl?: string;
  webhookConfigured?: boolean;
  endpointAccessible?: boolean;
  eventReceived?: boolean;
}

interface EvolutionInstanceStore {
  instances: EvolutionInstance[];
  loading: boolean;
  error: string | null;
  listInstances: (filters?: { status?: string }) => Promise<void>;
  createInstance: (data: CreateInstanceData) => Promise<EvolutionInstance>;
  updateInstance: (id: string, data: UpdateInstanceData) => Promise<EvolutionInstance>;
  deleteInstance: (id: string) => Promise<void>;
  testInstance: (id: string) => Promise<TestResult>;
  testSendTextMessage: (id: string, phone: string) => Promise<TestResult>;
  testSendMedia: (id: string, phone: string, mediaBase64?: string, mimeType?: string) => Promise<TestResult>;
  testSendAudio: (id: string, phone: string, audioBase64?: string, mimeType?: string) => Promise<TestResult>;
  testWebhook: (id: string) => Promise<TestResult>;
  testWebSocket: (id: string, timeout?: number) => Promise<TestResult>;
}

export const useEvolutionInstanceStore = create<EvolutionInstanceStore>((set, get) => ({
  instances: [],
  loading: false,
  error: null,

  listInstances: async (filters) => {
    set({ loading: true, error: null });
    try {
      const params = filters?.status ? { status: filters.status } : {};
      const response = await api.get<EvolutionInstance[]>('/api/evolution-instances', params);
      set({ instances: response.data || response, loading: false });
    } catch (error: any) {
      console.error('Erro ao listar instâncias:', error);
      set({
        error: error.response?.data?.error || 'Erro ao listar instâncias',
        loading: false,
      });
      throw error;
    }
  },

  createInstance: async (data) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post<EvolutionInstance>('/api/evolution-instances', data);
      const newInstance = response.data || response;
      set((state) => ({
        instances: [newInstance, ...state.instances],
        loading: false,
      }));
      return newInstance;
    } catch (error: any) {
      console.error('Erro ao criar instância:', error);
      set({
        error: error.response?.data?.error || 'Erro ao criar instância',
        loading: false,
      });
      throw error;
    }
  },

  updateInstance: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const response = await api.put<EvolutionInstance>(`/api/evolution-instances/${id}`, data);
      const updatedInstance = response.data || response;
      set((state) => ({
        instances: state.instances.map((inst) => (inst.id === id ? updatedInstance : inst)),
        loading: false,
      }));
      return updatedInstance;
    } catch (error: any) {
      console.error('Erro ao atualizar instância:', error);
      set({
        error: error.response?.data?.error || 'Erro ao atualizar instância',
        loading: false,
      });
      throw error;
    }
  },

  deleteInstance: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/api/evolution-instances/${id}`);
      set((state) => ({
        instances: state.instances.filter((inst) => inst.id !== id),
        loading: false,
      }));
    } catch (error: any) {
      console.error('Erro ao deletar instância:', error);
      set({
        error: error.response?.data?.error || 'Erro ao deletar instância',
        loading: false,
      });
      throw error;
    }
  },

  testInstance: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post<TestResult>(`/api/evolution-instances/${id}/test`);
      const testResult = response.data || response;
      
      // Buscar instância atualizada do backend para obter o número conectado
      try {
        const updatedResponse = await api.get<EvolutionInstance>(`/api/evolution-instances/${id}`);
        const updatedInstance = updatedResponse.data || updatedResponse;
        
        // Atualizar instância na lista com dados completos
        set((state) => ({
          instances: state.instances.map((inst) =>
            inst.id === id ? updatedInstance : inst
          ),
          loading: false,
        }));
      } catch (fetchError) {
        // Se falhar ao buscar, atualizar apenas com os dados disponíveis
        set((state) => ({
          instances: state.instances.map((inst) =>
            inst.id === id
              ? {
                  ...inst,
                  status: testResult.success ? 'ACTIVE' : 'ERROR',
                  lastTestedAt: new Date().toISOString(),
                  testResult,
                }
              : inst
          ),
          loading: false,
        }));
      }
      
      return testResult;
    } catch (error: any) {
      console.error('Erro ao testar instância:', error);
      set({
        error: error.response?.data?.error || 'Erro ao testar instância',
        loading: false,
      });
      throw error;
    }
  },

  testSendTextMessage: async (id, phone) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post<TestResult>(`/api/evolution-instances/${id}/test/text`, {
        phone,
      });
      const testResult = response.data || response;
      set({ loading: false });
      return testResult;
    } catch (error: any) {
      console.error('Erro ao testar envio de texto:', error);
      set({
        error: error.response?.data?.error || 'Erro ao testar envio de texto',
        loading: false,
      });
      throw error;
    }
  },

  testSendMedia: async (id, phone, mediaBase64?: string, mimeType?: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post<TestResult>(`/api/evolution-instances/${id}/test/media`, {
        phone,
        mediaBase64,
        mimeType,
      });
      const testResult = response.data || response;
      set({ loading: false });
      return testResult;
    } catch (error: any) {
      console.error('Erro ao testar envio de mídia:', error);
      set({
        error: error.response?.data?.error || 'Erro ao testar envio de mídia',
        loading: false,
      });
      throw error;
    }
  },

  testSendAudio: async (id, phone, audioBase64?: string, mimeType?: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post<TestResult>(`/api/evolution-instances/${id}/test/audio`, {
        phone,
        audioBase64,
        mimeType,
      });
      const testResult = response.data || response;
      set({ loading: false });
      return testResult;
    } catch (error: any) {
      console.error('Erro ao testar envio de áudio:', error);
      set({
        error: error.response?.data?.error || 'Erro ao testar envio de áudio',
        loading: false,
      });
      throw error;
    }
  },

  testWebhook: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post<TestResult>(`/api/evolution-instances/${id}/test/webhook`);
      const testResult = response.data || response;
      set({ loading: false });
      return testResult;
    } catch (error: any) {
      console.error('Erro ao testar webhook:', error);
      set({
        error: error.response?.data?.error || 'Erro ao testar webhook',
        loading: false,
      });
      throw error;
    }
  },

  testWebSocket: async (id, timeout = 30000) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post<TestResult>(`/api/evolution-instances/${id}/test/websocket`, {
        timeout,
      });
      const testResult = response.data || response;
      set({ loading: false });
      return testResult;
    } catch (error: any) {
      console.error('Erro ao testar WebSocket:', error);
      set({
        error: error.response?.data?.error || 'Erro ao testar WebSocket',
        loading: false,
      });
      throw error;
    }
  },
}));

