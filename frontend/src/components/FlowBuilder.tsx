import { useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import { DndProvider } from 'react-dnd';
import type { Node } from '../types/reactflow';
import { HTML5Backend } from 'react-dnd-html5-backend';
import 'reactflow/dist/style.css';
import { useDrop } from 'react-dnd';
import { useFlowStore } from '../store/useFlowStore';
import CustomNode from './nodes/CustomNode';
import FlowBuilderHeader from './FlowBuilderHeader';
import FlowBuilderSidebar from './FlowBuilderSidebar';

const nodeTypes = {
  custom: CustomNode,
};

function FlowCanvas() {
  const reactFlowInstance = useReactFlow();
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const onEdgesChange = useFlowStore((state) => state.onEdgesChange);
  const onConnect = useFlowStore((state) => state.onConnect);
  const addNode = useFlowStore((state) => state.addNode);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const [{ isOver }, drop] = useDrop({
    accept: 'node',
    drop: (item: { type: string }, monitor) => {
      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds || !reactFlowInstance) return;

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: clientOffset.x - reactFlowBounds.left,
        y: clientOffset.y - reactFlowBounds.top,
      });

      addNode(item.type, position);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <div
        ref={drop}
        className={`w-full h-full ${isOver ? 'bg-primary-50/20 dark:bg-primary-900/20' : ''}`}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          className="bg-slate-50 dark:bg-slate-900"
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(node: Node) => {
              const colors: Record<string, string> = {
                START: '#10b981',
                MESSAGE: '#3b82f6',
                MEDIA: '#a855f7',
                ACTION: '#eab308',
                HTTP: '#f97316',
                AI: '#ec4899',
                CONDITION: '#6366f1',
                END: '#ef4444',
              };
              return colors[node.data?.type] || '#6b7280';
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function FlowBuilder() {
  return (
    <DndProvider backend={HTML5Backend}>
      <ReactFlowProvider>
        <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          <FlowBuilderHeader />
          <div className="flex-1 flex overflow-hidden">
            <FlowBuilderSidebar />
            <div className="flex-1">
              <FlowCanvas />
            </div>
          </div>
        </div>
      </ReactFlowProvider>
    </DndProvider>
  );
}

