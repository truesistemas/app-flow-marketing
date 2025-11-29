import { useState, useRef, useMemo } from 'react';
import { Upload, File, X, Loader2, CheckCircle2, XCircle, Eye, AlertCircle, Settings } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { detectColumns } from '../../utils/column-detection';

interface LeadImportStepProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
}

interface LeadRow {
  [key: string]: any;
  phone?: string;
  telefone?: string;
  _status?: 'valid' | 'invalid' | 'duplicate';
  _error?: string;
}

export default function LeadImportStep({ onFileSelected, selectedFile }: LeadImportStepProps) {
  const [preview, setPreview] = useState<LeadRow[]>([]);
  const [allLeads, setAllLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFullModal, setShowFullModal] = useState(false);
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [detectedColumns, setDetectedColumns] = useState<{
    phoneIndex: number | null;
    nameIndex: number | null;
    phoneColumn: string | null;
    nameColumn: string | null;
  } | null>(null);
  const [mappedColumns, setMappedColumns] = useState<{
    phone: string | null;
    name: string | null;
  }>({ phone: null, name: null });
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validar telefone
  const validatePhone = (phone: string | undefined): boolean => {
    if (!phone) return false;
    // Remove caracteres não numéricos
    const cleaned = phone.replace(/\D/g, '');
    // Valida se tem entre 10 e 15 dígitos
    return cleaned.length >= 10 && cleaned.length <= 15;
  };

  // Processar e validar leads
  const processLeads = (data: any[], phoneColumn: string | null, nameColumn: string | null): LeadRow[] => {
    const processed: LeadRow[] = [];
    const phoneSet = new Set<string>();

    data.forEach((row, index) => {
      const lead: LeadRow = { ...row };
      
      // Usar coluna mapeada ou tentar detectar automaticamente
      let phone: string | undefined;
      if (phoneColumn && row[phoneColumn] !== undefined) {
        phone = String(row[phoneColumn] || '');
      } else {
        // Fallback: tentar encontrar telefone em qualquer coluna
        phone = lead.phone || lead.telefone || lead.Phone || lead.Telefone || 
                lead.celular || lead.Celular || lead.whatsapp || lead.WhatsApp;
      }

      if (!phone) {
        lead._status = 'invalid';
        lead._error = 'Telefone não encontrado';
      } else if (!validatePhone(phone)) {
        lead._status = 'invalid';
        lead._error = 'Telefone inválido';
      } else {
        const cleanedPhone = phone.replace(/\D/g, '');
        if (phoneSet.has(cleanedPhone)) {
          lead._status = 'duplicate';
          lead._error = 'Telefone duplicado';
        } else {
          phoneSet.add(cleanedPhone);
          lead._status = 'valid';
          lead.phone = cleanedPhone; // Normalizar telefone
          
          // Adicionar nome se encontrado
          if (nameColumn && row[nameColumn]) {
            lead.name = String(row[nameColumn]);
          }
        }
      }

      processed.push(lead);
    });

    return processed;
  };

  const handleFileSelect = async (file: File) => {
    setLoading(true);
    onFileSelected(file);

    try {
      let data: any[] = [];
      let headers: string[] = [];

      if (file.name.endsWith('.csv')) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            data = results.data as any[];
            if (data.length > 0) {
              headers = Object.keys(data[0]);
              setRawHeaders(headers);
              setRawData(data);
              
              // Detectar colunas automaticamente
              const detected = detectColumns(headers);
              setDetectedColumns(detected);
              
              // Se encontrou telefone, processar diretamente
              if (detected.phoneColumn) {
                setMappedColumns({ phone: detected.phoneColumn, name: detected.nameColumn });
                const processed = processLeads(data, detected.phoneColumn, detected.nameColumn);
                setAllLeads(processed);
                setPreview(processed.slice(0, 10));
              } else {
                // Se não encontrou, mostrar modal de mapeamento
                setShowColumnMapping(true);
              }
            }
            setLoading(false);
          },
          error: (error) => {
            console.error('Erro ao processar CSV:', error);
            setLoading(false);
          },
        });
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const arrayBuffer = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            data = XLSX.utils.sheet_to_json(firstSheet);
            
            if (data.length > 0) {
              headers = Object.keys(data[0]);
              setRawHeaders(headers);
              setRawData(data);
              
              // Detectar colunas automaticamente
              const detected = detectColumns(headers);
              setDetectedColumns(detected);
              
              // Se encontrou telefone, processar diretamente
              if (detected.phoneColumn) {
                setMappedColumns({ phone: detected.phoneColumn, name: detected.nameColumn });
                const processed = processLeads(data, detected.phoneColumn, detected.nameColumn);
                setAllLeads(processed);
                setPreview(processed.slice(0, 10));
              } else {
                // Se não encontrou, mostrar modal de mapeamento
                setShowColumnMapping(true);
              }
            }
            setLoading(false);
          } catch (error) {
            console.error('Erro ao processar Excel:', error);
            setLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        setPreview([]);
        setAllLeads([]);
        setLoading(false);
      }
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      setLoading(false);
    }
  };

  const handleColumnMappingConfirm = () => {
    if (!mappedColumns.phone) {
      alert('Por favor, selecione a coluna de telefone');
      return;
    }
    
    const processed = processLeads(rawData, mappedColumns.phone, mappedColumns.name);
    setAllLeads(processed);
    setPreview(processed.slice(0, 10));
    setShowColumnMapping(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Estatísticas
  const stats = useMemo(() => {
    const total = allLeads.length;
    const valid = allLeads.filter((l) => l._status === 'valid').length;
    const invalid = allLeads.filter((l) => l._status === 'invalid').length;
    const duplicate = allLeads.filter((l) => l._status === 'duplicate').length;
    return { total, valid, invalid, duplicate };
  }, [allLeads]);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'valid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-3 h-3" />
            Válido
          </span>
        );
      case 'invalid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
            <XCircle className="w-3 h-3" />
            Inválido
          </span>
        );
      case 'duplicate':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
            <AlertCircle className="w-3 h-3" />
            Duplicado
          </span>
        );
      default:
        return null;
    }
  };

  const columns = useMemo(() => {
    if (preview.length === 0) return [];
    const cols = new Set<string>();
    preview.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!key.startsWith('_')) cols.add(key);
      });
    });
    return Array.from(cols);
  }, [preview]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Importar Leads
          </label>
          {allLeads.length > 0 && mappedColumns.phone && (
            <button
              type="button"
              onClick={() => setShowColumnMapping(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              title="Reconfigurar mapeamento de colunas"
            >
              <Settings className="w-3 h-3" />
              Mapear Colunas
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Faça upload de um arquivo CSV ou Excel com os contatos. O sistema tentará detectar automaticamente as colunas de telefone e nome.
        </p>

        {/* Estatísticas */}
        {allLeads.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.total}</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
              <div className="text-xs text-green-700 dark:text-green-400">Válidos</div>
              <div className="text-lg font-semibold text-green-700 dark:text-green-400">{stats.valid}</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
              <div className="text-xs text-red-700 dark:text-red-400">Inválidos</div>
              <div className="text-lg font-semibold text-red-700 dark:text-red-400">{stats.invalid}</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="text-xs text-yellow-700 dark:text-yellow-400">Duplicados</div>
              <div className="text-lg font-semibold text-yellow-700 dark:text-yellow-400">{stats.duplicate}</div>
            </div>
          </div>
        )}

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-primary-500 transition-colors"
        >
          {selectedFile ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-primary-600 dark:text-primary-400">
                <File className="w-5 h-5" />
                <span className="font-medium">{selectedFile.name}</span>
                <button
                  onClick={() => {
                    onFileSelected(null as any);
                    setPreview([]);
                    setAllLeads([]);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="ml-2 text-red-600 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" />
              ) : preview.length > 0 ? (
                <div className="text-left">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Preview (primeiras 10 linhas de {allLeads.length}):
                    </p>
                    {allLeads.length > 10 && (
                      <button
                        onClick={() => setShowFullModal(true)}
                        className="flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        <Eye className="w-4 h-4" />
                        Ver todos
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          {columns.map((key) => (
                            <th
                              key={key}
                              className="px-3 py-2 text-left text-gray-700 dark:text-gray-300 font-medium border-b border-gray-200 dark:border-gray-700"
                            >
                              {key}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300 font-medium border-b border-gray-200 dark:border-gray-700">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, index) => (
                          <tr
                            key={index}
                            className={`border-b border-gray-100 dark:border-gray-800 ${
                              row._status === 'valid'
                                ? 'bg-green-50/50 dark:bg-green-900/10'
                                : row._status === 'invalid'
                                ? 'bg-red-50/50 dark:bg-red-900/10'
                                : 'bg-yellow-50/50 dark:bg-yellow-900/10'
                            }`}
                          >
                            {columns.map((key) => (
                              <td key={key} className="px-3 py-2 text-gray-600 dark:text-gray-400">
                                {String(row[key] || '')}
                              </td>
                            ))}
                            <td className="px-3 py-2">{getStatusBadge(row._status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="w-12 h-12 text-gray-400 mx-auto" />
              <div>
                <p className="text-gray-600 dark:text-gray-400 mb-2">Arraste o arquivo aqui ou</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileSelect(file);
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

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Dica:</strong> O sistema tentará detectar automaticamente as colunas de telefone e nome.
          Se não conseguir, você poderá mapear manualmente.
        </p>
      </div>

      {/* Modal de mapeamento de colunas */}
      {showColumnMapping && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Mapear Colunas
              </h2>
              <button
                onClick={() => setShowColumnMapping(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Selecione qual coluna corresponde ao telefone e ao nome (opcional):
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Coluna de Telefone *
                  </label>
                  <select
                    value={mappedColumns.phone || ''}
                    onChange={(e) => setMappedColumns({ ...mappedColumns, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Selecione uma coluna</option>
                    {rawHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                        {detectedColumns?.phoneColumn === header && ' (detectado automaticamente)'}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Coluna de Nome (opcional)
                  </label>
                  <select
                    value={mappedColumns.name || ''}
                    onChange={(e) => setMappedColumns({ ...mappedColumns, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Nenhuma</option>
                    {rawHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                        {detectedColumns?.nameColumn === header && ' (detectado automaticamente)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowColumnMapping(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleColumnMappingConfirm}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal com todos os leads */}
      {showFullModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Todos os Leads ({allLeads.length})
              </h2>
              <button
                onClick={() => setShowFullModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      {columns.map((key) => (
                        <th
                          key={key}
                          className="px-3 py-2 text-left text-gray-700 dark:text-gray-300 font-medium border-b border-gray-200 dark:border-gray-700"
                        >
                          {key}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300 font-medium border-b border-gray-200 dark:border-gray-700">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allLeads.map((row, index) => (
                      <tr
                        key={index}
                        className={`border-b border-gray-100 dark:border-gray-800 ${
                          row._status === 'valid'
                            ? 'bg-green-50/50 dark:bg-green-900/10'
                            : row._status === 'invalid'
                            ? 'bg-red-50/50 dark:bg-red-900/10'
                            : 'bg-yellow-50/50 dark:bg-yellow-900/10'
                        }`}
                      >
                        {columns.map((key) => (
                          <td key={key} className="px-3 py-2 text-gray-600 dark:text-gray-400">
                            {String(row[key] || '')}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {getStatusBadge(row._status)}
                          {row._error && (
                            <div className="text-xs text-red-600 dark:text-red-400 mt-1">{row._error}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
