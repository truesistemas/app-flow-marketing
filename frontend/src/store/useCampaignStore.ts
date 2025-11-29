import { create } from 'zustand';
import api from '../services/api';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  flowId?: string;
  totalLeads: number;
  instanceId?: string;
  instanceName?: string;
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  flow?: {
    id: string;
    name: string;
  };
  stats?: {
    totalLeads: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    error: number;
  };
  _count?: {
    leads: number;
  };
}

interface CampaignStore {
  campaigns: Campaign[];
  currentCampaign: Campaign | null;
  loading: boolean;
  error: string | null;
  fetchCampaigns: (filters?: { status?: string; search?: string }) => Promise<void>;
  fetchCampaign: (id: string) => Promise<void>;
  createCampaign: (data: {
    name: string;
    description?: string;
    flowId?: string;
    instanceId?: string;
    instanceName?: string;
    scheduledAt?: string;
    messageContent?: any;
  }) => Promise<Campaign>;
  startCampaign: (id: string) => Promise<void>;
  pauseCampaign: (id: string) => Promise<void>;
  importLeads: (id: string, file: File) => Promise<{ imported: number }>;
  updateCampaign: (id: string, data: {
    name?: string;
    description?: string;
    flowId?: string;
    instanceId?: string;
    scheduledAt?: string;
    messageContent?: any;
  }) => Promise<Campaign>;
  deleteCampaign: (id: string) => Promise<void>;
}

export const useCampaignStore = create<CampaignStore>((set, get) => ({
  campaigns: [],
  currentCampaign: null,
  loading: false,
  error: null,

  fetchCampaigns: async (filters) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.search) params.append('search', filters.search);

      const response = await api.get<{ campaigns: Campaign[] }>(
        `/api/campaigns?${params.toString()}`
      );
      set({ campaigns: response.data.campaigns, loading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Erro ao carregar campanhas',
        loading: false,
      });
    }
  },

  fetchCampaign: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get<{ campaign: Campaign }>(`/api/campaigns/${id}`);
      set({ currentCampaign: response.data.campaign, loading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Erro ao carregar campanha',
        loading: false,
      });
    }
  },

  createCampaign: async (data) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post<{ campaign: Campaign }>('/api/campaigns', data);
      const newCampaign = response.data.campaign;
      set((state) => ({
        campaigns: [newCampaign, ...state.campaigns],
        loading: false,
      }));
      return newCampaign;
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Erro ao criar campanha',
        loading: false,
      });
      throw error;
    }
  },

  startCampaign: async (id: string) => {
    try {
      await api.post(`/api/campaigns/${id}/start`);
      set((state) => ({
        campaigns: state.campaigns.map((c) =>
          c.id === id ? { ...c, status: 'RUNNING' as const } : c
        ),
        currentCampaign:
          state.currentCampaign?.id === id
            ? { ...state.currentCampaign, status: 'RUNNING' as const }
            : state.currentCampaign,
      }));
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Erro ao iniciar campanha');
    }
  },

  pauseCampaign: async (id: string) => {
    try {
      await api.post(`/api/campaigns/${id}/pause`);
      set((state) => ({
        campaigns: state.campaigns.map((c) =>
          c.id === id ? { ...c, status: 'PAUSED' as const } : c
        ),
        currentCampaign:
          state.currentCampaign?.id === id
            ? { ...state.currentCampaign, status: 'PAUSED' as const }
            : state.currentCampaign,
      }));
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Erro ao pausar campanha');
    }
  },

  importLeads: async (id: string, file: File) => {
    set({ loading: true, error: null });
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post<{ imported: number; message: string }>(
        `/api/campaigns/${id}/import-leads`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      // Recarregar campanha para atualizar stats
      await get().fetchCampaign(id);

      set({ loading: false });
      return { imported: response.data.imported };
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Erro ao importar leads',
        loading: false,
      });
      throw error;
    }
  },

  updateCampaign: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const response = await api.put<{ campaign: Campaign }>(`/api/campaigns/${id}`, data);
      const updatedCampaign = response.data.campaign;
      set((state) => ({
        campaigns: state.campaigns.map((c) => (c.id === id ? updatedCampaign : c)),
        currentCampaign:
          state.currentCampaign?.id === id ? updatedCampaign : state.currentCampaign,
        loading: false,
      }));
      return updatedCampaign;
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Erro ao atualizar campanha',
        loading: false,
      });
      throw error;
    }
  },

  deleteCampaign: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/api/campaigns/${id}`);
      set((state) => ({
        campaigns: state.campaigns.filter((c) => c.id !== id),
        currentCampaign:
          state.currentCampaign?.id === id ? null : state.currentCampaign,
        loading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Erro ao deletar campanha',
        loading: false,
      });
      throw error;
    }
  },
}));

