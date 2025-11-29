import { EventEmitter } from 'events';

/**
 * Serviço para rastrear eventos de webhook recebidos
 * Usado para testes e para o nó de webhook no flow
 */
export interface WebhookEvent {
  id: string;
  instance: string;
  event: string;
  data: any;
  receivedAt: Date;
  organizationId?: string;
  testId?: string; // ID do teste que está aguardando este evento
  flowExecutionId?: string; // ID da execução do flow que está aguardando este evento
}

export class WebhookEventTrackerService extends EventEmitter {
  private events: Map<string, WebhookEvent[]> = new Map(); // instance -> events[]
  private pendingTests: Map<string, {
    resolve: (event: WebhookEvent) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    instance: string;
    organizationId: string;
  }> = new Map();

  /**
   * Registrar um evento de webhook recebido
   */
  registerEvent(event: WebhookEvent): void {
    const instance = event.instance;
    
    if (!this.events.has(instance)) {
      this.events.set(instance, []);
    }
    
    const events = this.events.get(instance)!;
    events.push(event);
    
    // Manter apenas os últimos 100 eventos por instância
    if (events.length > 100) {
      events.shift();
    }
    
    // Emitir evento para listeners
    this.emit('webhook-event', event);
    
    // Verificar se algum teste está aguardando este evento
    this.checkPendingTests(event);
  }

  /**
   * Verificar se algum teste pendente está aguardando este evento
   */
  private checkPendingTests(event: WebhookEvent): void {
    for (const [testId, pending] of this.pendingTests.entries()) {
      // Verificar se o evento corresponde ao teste
      if (
        pending.instance === event.instance &&
        pending.organizationId === event.organizationId
      ) {
        // Resolver o teste pendente
        clearTimeout(pending.timeout);
        this.pendingTests.delete(testId);
        pending.resolve(event);
        return;
      }
    }
  }

  /**
   * Aguardar recebimento de um evento de webhook
   * @param instance Nome da instância
   * @param organizationId ID da organização
   * @param timeout Timeout em milissegundos (padrão: 30 segundos)
   * @returns Promise que resolve quando o evento é recebido ou rejeita após timeout
   */
  async waitForEvent(
    instance: string,
    organizationId: string,
    timeout: number = 30000
  ): Promise<WebhookEvent> {
    return new Promise((resolve, reject) => {
      const testId = `test-${Date.now()}-${Math.random()}`;
      
      const timeoutHandle = setTimeout(() => {
        this.pendingTests.delete(testId);
        reject(new Error(`Timeout aguardando evento de webhook para instância ${instance}`));
      }, timeout);
      
      this.pendingTests.set(testId, {
        resolve,
        reject,
        timeout: timeoutHandle,
        instance,
        organizationId,
      });
      
      // Verificar se já existe um evento recente (últimos 5 segundos)
      const recentEvents = this.getRecentEvents(instance, organizationId, 5000);
      if (recentEvents.length > 0) {
        clearTimeout(timeoutHandle);
        this.pendingTests.delete(testId);
        resolve(recentEvents[0]);
      }
    });
  }

  /**
   * Obter eventos recentes para uma instância
   */
  getRecentEvents(
    instance: string,
    organizationId?: string,
    maxAge: number = 60000 // 1 minuto por padrão
  ): WebhookEvent[] {
    const events = this.events.get(instance) || [];
    const now = Date.now();
    
    return events.filter(event => {
      const age = now - event.receivedAt.getTime();
      if (age > maxAge) return false;
      if (organizationId && event.organizationId !== organizationId) return false;
      return true;
    });
  }

  /**
   * Obter todos os eventos para uma instância
   */
  getEvents(instance: string, organizationId?: string): WebhookEvent[] {
    const events = this.events.get(instance) || [];
    
    if (organizationId) {
      return events.filter(event => event.organizationId === organizationId);
    }
    
    return events;
  }

  /**
   * Limpar eventos antigos
   */
  clearOldEvents(maxAge: number = 3600000): void { // 1 hora por padrão
    const now = Date.now();
    
    for (const [instance, events] of this.events.entries()) {
      const filtered = events.filter(event => {
        const age = now - event.receivedAt.getTime();
        return age <= maxAge;
      });
      
      if (filtered.length === 0) {
        this.events.delete(instance);
      } else {
        this.events.set(instance, filtered);
      }
    }
  }

  /**
   * Limpar todos os eventos
   */
  clearAll(): void {
    this.events.clear();
    // Cancelar todos os testes pendentes
    for (const [testId, pending] of this.pendingTests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Teste cancelado'));
    }
    this.pendingTests.clear();
  }
}

// Singleton
export const webhookEventTracker = new WebhookEventTrackerService();

// Limpar eventos antigos a cada hora
setInterval(() => {
  webhookEventTracker.clearOldEvents();
}, 3600000);



