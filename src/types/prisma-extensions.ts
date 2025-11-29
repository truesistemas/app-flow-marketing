/**
 * Extensões de tipos do Prisma
 * 
 * Adiciona tipagem forte para campos JSON do Prisma
 */
import { FlowNode, FlowEdge, FlowContextData } from './flow-nodes';

// Estender tipos do Prisma para campos JSON
declare module '@prisma/client' {
  namespace Prisma {
    interface Flow {
      nodes: FlowNode[];
      edges: FlowEdge[];
    }

    interface FlowExecution {
      contextData: FlowContextData;
    }

    interface Contact {
      customFields: Record<string, any>;
    }
  }
}






