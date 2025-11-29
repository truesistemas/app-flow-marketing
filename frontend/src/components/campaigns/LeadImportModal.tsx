import { useState, useRef } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { useCampaignStore } from '../../store/useCampaignStore';

interface LeadImportModalProps {
  campaignId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LeadImportModal({
  campaignId,
  onClose,
  onSuccess,
}: LeadImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importLeads = useCampaignStore((state) => state.importLeads);

  const handleFileSelect = (selectedFile: File) => {
    if (
      selectedFile.name.endsWith('.csv') ||
      selectedFile.name.endsWith('.xlsx') ||
      selectedFile.name.endsWith('.xls')
    ) {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Formato de arquivo não suportado. Use CSV ou Excel');
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Selecione um arquivo');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await importLeads(campaignId, file);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Erro ao importar leads');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="glass-effect rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Importar Leads
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Selecionar Arquivo
              </label>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                {file ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-primary-600 dark:text-primary-400">
                      <Upload className="w-5 h-5" />
                      <span className="font-medium">{file.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remover arquivo
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => {
                          const selectedFile = e.target.files?.[0];
                          if (selectedFile) {
                            handleFileSelect(selectedFile);
                          }
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                      >
                        Selecionar Arquivo
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Formatos suportados: CSV, Excel (.xlsx, .xls)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Importante:</strong> O arquivo deve conter uma coluna "phone" ou "telefone"
                com os números no formato internacional (ex: 5511999999999). Outras colunas serão
                salvas como campos personalizados.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!file || loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Importar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}






