/**
 * Tipos do React Flow v11
 * Alguns tipos não são exportados diretamente, então definimos manualmente
 */

// Tipos base
export type Node = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: any;
  selected?: boolean;
  dragging?: boolean;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  className?: string;
};

export type Edge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  animated?: boolean;
  selected?: boolean;
  style?: React.CSSProperties;
  label?: string;
};

export type Connection = {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

// Tipos de mudanças
export type NodeChange = 
  | { type: 'select'; id: string; selected: boolean }
  | { type: 'position'; id: string; position: { x: number; y: number } }
  | { type: 'dimensions'; id: string; dimensions: { width: number; height: number } }
  | { type: 'remove'; id: string }
  | { type: 'add'; item: Node }
  | { type: 'reset'; item: Node };

export type EdgeChange =
  | { type: 'select'; id: string; selected: boolean }
  | { type: 'remove'; id: string }
  | { type: 'add'; item: Edge }
  | { type: 'reset'; item: Edge };

// NodeProps para componentes customizados
export type NodeProps = {
  id: string;
  data: any;
  selected?: boolean;
  type?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  dragging?: boolean;
};

