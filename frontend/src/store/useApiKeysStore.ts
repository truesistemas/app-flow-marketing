import { create } from 'zustand';
import api from '../services/api';

interface ApiKeys {
  openai: string | null;
  gemini: string | null;
  anthropic: string | null;
}

interface ApiKeysStore {
  keys: ApiKeys | null;
  loading: boolean;
  error: string | null;
  getApiKeys: (organizationId: string) => Promise<void>;
  updateApiKey: (organizationId: string, provider: 'openai' | 'gemini' | 'anthropic', key: string | null) => Promise<void>;
  testApiKey: (organizationId: string, provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC', apiKey?: string) => Promise<{ success: boolean; message?: string; error?: string }>;
}

export const useApiKeysStore = create<ApiKeysStore>((set, get) => ({
  keys: null,
  loading: false,
  error: null,

  getApiKeys: async (organizationId: string) => {
    try {
      set({ loading: true, error: null });
      const response = await api.get<ApiKeys>(`/api/organizations/${organizationId}/api-keys`);
      set({ keys: response.data, loading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Erro ao carregar chaves API',
        loading: false,
      });
    }
  },

  updateApiKey: async (organizationId: string, provider: 'openai' | 'gemini' | 'anthropic', key: string | null) => {
    try {
      set({ loading: true, error: null });
      const updateData: any = {};
      updateData[provider] = key;

      const response = await api.put(`/api/organizations/${organizationId}/api-keys`, updateData);
      
      // Atualizar chaves locais
      if (response.data.keys) {
        set({ keys: response.data.keys, loading: false });
      } else {
        // Recarregar chaves
        await get().getApiKeys(organizationId);
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Erro ao atualizar chave API',
        loading: false,
      });
      throw error;
    }
  },

  testApiKey: async (organizationId: string, provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC', apiKey?: string) => {
    try {
      set({ loading: true, error: null });
      const response = await api.post<{ success: boolean; message?: string; error?: string }>(
        `/api/organizations/${organizationId}/api-keys/test`,
        {
          provider,
          apiKey,
        }
      );
      set({ loading: false });
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Erro ao testar chave API';
      set({ error: errorMessage, loading: false });
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
}));

