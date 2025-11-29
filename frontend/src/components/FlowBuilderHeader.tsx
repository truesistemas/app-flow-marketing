import { Save } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';

export default function Header() {
  const flowName = useFlowStore((state) => state.flowName);
  const setFlowName = useFlowStore((state) => state.setFlowName);
  const saveFlow = useFlowStore((state) => state.saveFlow);

  const handleSave = () => {
    const flowData = saveFlow();
    const json = JSON.stringify(flowData, null, 2);
    
    // Criar blob e fazer download
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flowName || 'flow'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Também logar no console para debug
    console.log('Flow salvo:', flowData);
    
    alert('Flow salvo com sucesso!');
  };

  return (
    <div className="h-16 glass-effect border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4 flex-1">
        <input
          type="text"
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          className="text-xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 rounded px-2 py-1"
          placeholder="Nome do Flow"
        />
      </div>

      <button
        onClick={handleSave}
        className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium shadow-lg hover:shadow-xl"
      >
        <Save className="w-4 h-4" />
        Salvar Flow
      </button>
    </div>
  );
}

