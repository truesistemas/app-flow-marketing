import { useState, useRef, useEffect } from 'react';
import { Upload, X, Image, Video, Music, File, Loader2 } from 'lucide-react';
import api from '../../services/api';

interface MediaSelectorProps {
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
}

const getMediaTypeFromUrl = (url: string): 'image' | 'video' | 'audio' | 'document' => {
  if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return 'image';
  if (url.match(/\.(mp4|webm|mov)$/i)) return 'video';
  if (url.match(/\.(mp3|ogg|wav)$/i)) return 'audio';
  return 'document';
};

export default function MediaSelector({ value, onChange, onRemove }: MediaSelectorProps) {
  // Inicializar preview e mediaType com value inicial
  const initialPreview = value || null;
  const initialMediaType = value ? getMediaTypeFromUrl(value) : null;

  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(initialPreview);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'audio' | 'document' | null>(initialMediaType);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincronizar preview e mediaType quando value mudar (ex: ao carregar flow)
  useEffect(() => {
    if (value) {
      setPreview(value);
      // Detectar tipo de mídia automaticamente pela URL
      const detectedType = getMediaTypeFromUrl(value);
      setMediaType(detectedType);
    } else {
      // Se value foi removido, limpar preview
      setPreview(null);
      setMediaType(null);
    }
  }, [value]);

  const handleFileSelect = async (file: File) => {
    // Validar tipo
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/ogg',
      'audio/mp3',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type)) {
      alert('Tipo de arquivo não permitido');
      return;
    }

    // Validar tamanho (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Arquivo muito grande. Tamanho máximo: 10MB');
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/api/media/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const mediaUrl = response.data?.url || response.url;
      const type = response.data?.type || response.type || getMediaTypeFromUrl(mediaUrl);

      setMediaType(type);
      setPreview(mediaUrl);
      onChange(mediaUrl);
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      alert(error.response?.data?.error || 'Erro ao fazer upload do arquivo');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleRemove = () => {
    setPreview(null);
    setMediaType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onRemove) {
      onRemove();
    }
  };

  const getPreviewUrl = () => {
    if (!preview) return null;
    // Se for URL relativa, construir URL completa
    if (preview.startsWith('/uploads/')) {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      return `${apiUrl}${preview}`;
    }
    return preview;
  };

  const previewUrl = getPreviewUrl();

  return (
    <div className="space-y-2">
      {preview ? (
        <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {mediaType === 'image' && previewUrl && (
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full h-32 object-cover"
              onError={() => setMediaType('document')}
            />
          )}
          {mediaType === 'video' && previewUrl && (
            <video src={previewUrl} controls className="w-full h-32 object-cover" />
          )}
          {mediaType === 'audio' && previewUrl && (
            <div className="p-4 flex items-center gap-3">
              <Music className="w-8 h-8 text-primary-600" />
              <audio src={previewUrl} controls className="flex-1" />
            </div>
          )}
          {(mediaType === 'document' || !mediaType) && (
            <div className="p-4 flex items-center gap-3">
              <File className="w-8 h-8 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Arquivo selecionado
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{preview}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary-500 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Enviando...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-gray-400" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Arraste um arquivo aqui ou clique para selecionar
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Imagem, Vídeo, Áudio ou Documento (máx. 10MB)
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileSelect(file);
              }
            }}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}

