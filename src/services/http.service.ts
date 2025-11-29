import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * HTTP Service
 * 
 * Gerencia requisições HTTP para webhooks externos
 */
export class HttpService {
  /**
   * Faz uma requisição HTTP
   */
  async request(config: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: Record<string, any> | string;
    timeout?: number;
  }): Promise<any> {
    const axiosConfig: AxiosRequestConfig = {
      method: config.method,
      url: config.url,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      timeout: config.timeout ? config.timeout * 1000 : 30000, // Converter para ms
    };

    if (config.body) {
      if (config.method === 'GET') {
        axiosConfig.params = config.body;
      } else {
        axiosConfig.data = config.body;
      }
    }

    try {
      const response: AxiosResponse = await axios(axiosConfig);
      return response.data;
    } catch (error: any) {
      console.error(`Erro na requisição HTTP ${config.method} ${config.url}:`, error.message);
      
      // Retornar erro estruturado
      throw {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      };
    }
  }

  /**
   * Faz requisição GET
   */
  async get(url: string, params?: Record<string, any>, headers?: Record<string, string>): Promise<any> {
    return this.request({
      method: 'GET',
      url,
      body: params,
      headers,
    });
  }

  /**
   * Faz requisição POST
   */
  async post(url: string, body?: Record<string, any> | string, headers?: Record<string, string>): Promise<any> {
    return this.request({
      method: 'POST',
      url,
      body,
      headers,
    });
  }

  /**
   * Faz requisição PUT
   */
  async put(url: string, body?: Record<string, any> | string, headers?: Record<string, string>): Promise<any> {
    return this.request({
      method: 'PUT',
      url,
      body,
      headers,
    });
  }

  /**
   * Faz requisição PATCH
   */
  async patch(url: string, body?: Record<string, any> | string, headers?: Record<string, string>): Promise<any> {
    return this.request({
      method: 'PATCH',
      url,
      body,
      headers,
    });
  }

  /**
   * Faz requisição DELETE
   */
  async delete(url: string, headers?: Record<string, string>): Promise<any> {
    return this.request({
      method: 'DELETE',
      url,
      headers,
    });
  }
}






