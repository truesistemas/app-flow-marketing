import { create } from 'zustand';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import type { FlowNode, FlowEdge } from '../types/flow-nodes';
import type { Node, Edge, Connection, NodeChange, EdgeChange } from '../types/reactflow';

interface FlowStore {
  nodes: Node[];
  edges: Edge[];
  flowName: string;
  setFlowName: (name: string) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: string, position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, data: any) => void;
  saveFlow: () => { nodes: FlowNode[]; edges: FlowEdge[] };
  loadFlow: (flowData: { nodes: FlowNode[]; edges: FlowEdge[] }) => void;
  resetFlow: () => void;
}

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export const useFlowStore = create<FlowStore>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  flowName: 'Novo Flow',

  setFlowName: (name: string) => {
    set({ flowName: name });
  },

  setNodes: (nodes: Node[]) => {
    set({ nodes });
  },

  setEdges: (edges: Edge[]) => {
    set({ edges });
  },

  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection: Connection) => {
    set({
      edges: addEdge(connection, get().edges),
    });
  },

  addNode: (type: string, position: { x: number; y: number }) => {
    const id = `${type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'custom',
      position,
      data: {
        label: type,
        type,
        config: getDefaultConfig(type),
      },
    };

    set({
      nodes: [...get().nodes, newNode],
    });
  },

  updateNodeData: (nodeId: string, data: any) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      ),
    });
  },

  saveFlow: () => {
    const { nodes, edges } = get();
    
    const flowNodes: FlowNode[] = nodes.map((node) => ({
      id: node.id,
      type: node.data.type as any,
      position: node.position,
      label: node.data.label,
      config: node.data.config,
    }));

    const flowEdges: FlowEdge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || undefined,
      targetHandle: edge.targetHandle || undefined,
    }));

    return { nodes: flowNodes, edges: flowEdges };
  },

  loadFlow: (flowData: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
    const reactFlowNodes: Node[] = flowData.nodes.map((node) => ({
      id: node.id,
      type: 'custom',
      position: node.position,
      data: {
        label: node.label,
        type: node.type,
        config: node.config,
      },
    }));

    const reactFlowEdges: Edge[] = flowData.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }));

    set({
      nodes: reactFlowNodes,
      edges: reactFlowEdges,
    });
  },

  resetFlow: () => {
    set({
      nodes: initialNodes,
      edges: initialEdges,
      flowName: 'Novo Flow',
    });
  },
}));

function getDefaultConfig(type: string): any {
  switch (type) {
    case 'START':
      return {
        triggerType: 'KEYWORD',
        keyword: '',
      };
    case 'MESSAGE':
      return {
        text: '',
        variables: [],
      };
    case 'MEDIA':
      return {
        mediaType: 'IMAGE',
        url: '',
        caption: '',
      };
    case 'ACTION':
      return {
        actionType: 'WAIT_RESPONSE',
        timeout: undefined,
        saveResponseAs: '',
      };
    case 'HTTP':
      return {
        method: 'POST',
        url: '',
        headers: {},
        body: {},
      };
    case 'AI':
      return {
        provider: 'OPENAI',
        model: 'gpt-4',
        temperature: 0.7,
        systemPrompt: '',
        userPrompt: '',
      };
    case 'CONDITION':
      return {
        condition: {
          variable: '',
          operator: 'EQUALS',
          value: '',
        },
      };
    case 'END':
      return {
        message: '',
      };
    default:
      return {};
  }
}

