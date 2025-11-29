import { useDrag } from 'react-dnd';
import {
  MessageSquare,
  Image,
  Clock,
  Globe,
  Brain,
  GitBranch,
  Play,
  Square,
} from 'lucide-react';
import type { NodeType } from '../types/flow-nodes';

interface NodeTypeConfig {
  type: NodeType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
}

const nodeTypes: NodeTypeConfig[] = [
  {
    type: 'START',
    label: 'Início',
    icon: Play,
    color: 'bg-green-500',
    description: 'Gatilho do flow',
  },
  {
    type: 'MESSAGE',
    label: 'Mensagem',
    icon: MessageSquare,
    color: 'bg-blue-500',
    description: 'Enviar texto',
  },
  {
    type: 'MEDIA',
    label: 'Mídia',
    icon: Image,
    color: 'bg-purple-500',
    description: 'Enviar imagem/vídeo',
  },
  {
    type: 'ACTION',
    label: 'Ação',
    icon: Clock,
    color: 'bg-yellow-500',
    description: 'Aguardar resposta',
  },
  {
    type: 'TIMER',
    label: 'Timer',
    icon: Clock,
    color: 'bg-yellow-600',
    description: 'Aguarda intervalo',
  },
  {
    type: 'HTTP',
    label: 'HTTP',
    icon: Globe,
    color: 'bg-orange-500',
    description: 'Webhook externo',
  },
  {
    type: 'AI',
    label: 'IA',
    icon: Brain,
    color: 'bg-pink-500',
    description: 'Gerar resposta com IA',
  },
  {
    type: 'CONDITION',
    label: 'Condição',
    icon: GitBranch,
    color: 'bg-indigo-500',
    description: 'Decisão condicional',
  },
  {
    type: 'END',
    label: 'Fim',
    icon: Square,
    color: 'bg-red-500',
    description: 'Finalizar flow',
  },
];

interface DraggableNodeItemProps {
  nodeType: NodeTypeConfig;
}

function DraggableNodeItem({ nodeType }: DraggableNodeItemProps) {
  const [{ isDragging }, drag] = useDrag({
    type: 'node',
    item: { type: nodeType.type },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const Icon = nodeType.icon;

  return (
    <div
      ref={drag}
      className={`
        glass-effect p-3 rounded-lg cursor-move transition-all
        hover:shadow-lg hover:scale-105
        ${isDragging ? 'opacity-50' : 'opacity-100'}
      `}
    >
      <div className="flex items-center gap-3">
        <div className={`${nodeType.color} p-2 rounded-lg`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
            {nodeType.label}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {nodeType.description}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  return (
    <div className="w-64 h-full glass-effect border-r border-gray-200 dark:border-gray-700 p-4 overflow-y-auto">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
          Blocos
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Arraste para o canvas
        </p>
      </div>

      <div className="space-y-2">
        {nodeTypes.map((nodeType) => (
          <DraggableNodeItem key={nodeType.type} nodeType={nodeType} />
        ))}
      </div>
    </div>
  );
}

