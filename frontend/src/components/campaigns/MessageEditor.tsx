import { useState, useRef } from 'react';
import { Plus, X, Image, Video, Music, FileText, Trash2 } from 'lucide-react';
import MediaSelector from '../nodes/MediaSelector';
import EmojiPickerButton from './EmojiPickerButton';
import type { CampaignMessageContent } from '../../types/campaign';

interface MessageEditorProps {
  value?: CampaignMessageContent;
  onChange: (content: CampaignMessageContent) => void;
}

export default function MessageEditor({ value, onChange }: MessageEditorProps) {
  const [content, setContent] = useState<CampaignMessageContent>(
    value || { type: 'TEXT', text: '' }
  );
  const textTextareaRef = useRef<HTMLTextAreaElement>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const multiTextTextareaRefs = useRef<{ [key: number]: HTMLTextAreaElement | null }>({});
  const multiCaptionTextareaRefs = useRef<{ [key: number]: HTMLTextAreaElement | null }>({});

  const updateContent = (updates: Partial<CampaignMessageContent>) => {
    const newContent = { ...content, ...updates };
    setContent(newContent);
    onChange(newContent);
  };

  const addMultiItem = () => {
    if (!content.items) {
      updateContent({ type: 'MULTI', items: [] });
    }
    const newItems = [...(content.items || []), { type: 'TEXT' as const, text: '' }];
    updateContent({ items: newItems });
  };

  const updateMultiItem = (index: number, updates: any) => {
    const newItems = [...(content.items || [])];
    newItems[index] = { ...newItems[index], ...updates };
    updateContent({ items: newItems });
  };

  const removeMultiItem = (index: number) => {
    const newItems = content.items?.filter((_, i) => i !== index) || [];
    if (newItems.length === 0) {
      updateContent({ type: 'TEXT', text: content.text || '', items: undefined });
    } else {
      updateContent({ items: newItems });
    }
  };

  const getVariableSuggestions = () => {
    return ['{{nome}}', '{{telefone}}', '{{email}}'];
  };

  const insertVariable = (variable: string) => {
    if (content.type === 'TEXT' || content.type === 'MULTI') {
      const currentText = content.type === 'TEXT' ? content.text || '' : '';
      const newText = currentText + variable;
      if (content.type === 'TEXT') {
        updateContent({ text: newText });
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Tipo de Conteúdo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Tipo de Conteúdo
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => updateContent({ type: 'TEXT', text: content.text || '' })}
            className={`px-4 py-2 rounded-lg border ${
              content.type === 'TEXT'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Texto
          </button>
          <button
            type="button"
            onClick={() => updateContent({ type: 'MEDIA', mediaType: 'IMAGE' })}
            className={`px-4 py-2 rounded-lg border ${
              content.type === 'MEDIA'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Image className="w-4 h-4 inline mr-2" />
            Mídia
          </button>
          <button
            type="button"
            onClick={() => {
              if (!content.items) {
                updateContent({ type: 'MULTI', items: [{ type: 'TEXT', text: '' }] });
              }
            }}
            className={`px-4 py-2 rounded-lg border ${
              content.type === 'MULTI'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Múltiplo
          </button>
        </div>
      </div>

      {/* Conteúdo TEXT */}
      {content.type === 'TEXT' && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Mensagem de Texto
              </label>
              <EmojiPickerButton
                onEmojiSelect={(emoji) => {
                  const textarea = textTextareaRef.current;
                  if (textarea) {
                    const start = textarea.selectionStart || 0;
                    const end = textarea.selectionEnd || 0;
                    const text = content.text || '';
                    const newText = text.slice(0, start) + emoji + text.slice(end);
                    updateContent({ text: newText });
                    // Restaurar foco e posição do cursor
                    setTimeout(() => {
                      textarea.focus();
                      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
                    }, 0);
                  } else {
                    updateContent({ text: (content.text || '') + emoji });
                  }
                }}
                textareaRef={textTextareaRef}
              />
            </div>
            <textarea
              ref={textTextareaRef}
              value={content.text || ''}
              onChange={(e) => updateContent({ text: e.target.value })}
              placeholder="Digite sua mensagem aqui... Use {{nome}}, {{telefone}}, {{email}} para variáveis"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={6}
            />
            <div className="mt-2 flex gap-2 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-gray-400">Variáveis:</span>
              {getVariableSuggestions().map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => insertVariable(variable)}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {variable}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo MEDIA */}
      {content.type === 'MEDIA' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tipo de Mídia
            </label>
            <select
              value={content.mediaType || 'IMAGE'}
              onChange={(e) =>
                updateContent({ mediaType: e.target.value as 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' })
              }
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="IMAGE">Imagem</option>
              <option value="VIDEO">Vídeo</option>
              <option value="AUDIO">Áudio</option>
              <option value="DOCUMENT">Documento</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Arquivo de Mídia
            </label>
            <MediaSelector
              value={content.mediaUrl}
              onChange={(url) => updateContent({ mediaUrl: url })}
              onRemove={() => updateContent({ mediaUrl: undefined })}
            />
          </div>
          {content.mediaUrl && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Legenda (opcional)
                </label>
                <EmojiPickerButton
                  onEmojiSelect={(emoji) => {
                    const textarea = captionTextareaRef.current;
                    if (textarea) {
                      const start = textarea.selectionStart || 0;
                      const end = textarea.selectionEnd || 0;
                      const caption = content.caption || '';
                      const newCaption = caption.slice(0, start) + emoji + caption.slice(end);
                      updateContent({ caption: newCaption });
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
                      }, 0);
                    } else {
                      updateContent({ caption: (content.caption || '') + emoji });
                    }
                  }}
                  textareaRef={captionTextareaRef}
                />
              </div>
              <textarea
                ref={captionTextareaRef}
                value={content.caption || ''}
                onChange={(e) => updateContent({ caption: e.target.value })}
                placeholder="Legenda para a mídia..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                rows={3}
              />
            </div>
          )}
        </div>
      )}

      {/* Conteúdo MULTI */}
      {content.type === 'MULTI' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Blocos de Conteúdo
            </label>
            <button
              type="button"
              onClick={addMultiItem}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Adicionar Bloco
            </button>
          </div>
          {content.items?.map((item, index) => (
            <div
              key={index}
              className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900"
            >
              <div className="flex justify-between items-start mb-3">
                <select
                  value={item.type}
                  onChange={(e) =>
                    updateMultiItem(index, {
                      type: e.target.value,
                      text: e.target.value === 'TEXT' ? item.text || '' : undefined,
                      mediaUrl: e.target.value === 'MEDIA' ? item.mediaUrl : undefined,
                    })
                  }
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="TEXT">Texto</option>
                  <option value="MEDIA">Mídia</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeMultiItem(index)}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {item.type === 'TEXT' ? (
                <div>
                  <div className="flex items-center justify-end mb-2">
                    <EmojiPickerButton
                      onEmojiSelect={(emoji) => {
                        const textarea = multiTextTextareaRefs.current[index];
                        if (textarea) {
                          const start = textarea.selectionStart || 0;
                          const end = textarea.selectionEnd || 0;
                          const text = item.text || '';
                          const newText = text.slice(0, start) + emoji + text.slice(end);
                          updateMultiItem(index, { text: newText });
                          setTimeout(() => {
                            textarea.focus();
                            textarea.setSelectionRange(start + emoji.length, start + emoji.length);
                          }, 0);
                        } else {
                          updateMultiItem(index, { text: (item.text || '') + emoji });
                        }
                      }}
                      textareaRef={multiTextTextareaRefs.current[index] ? { current: multiTextTextareaRefs.current[index] } : undefined}
                    />
                  </div>
                  <textarea
                    ref={(el) => {
                      multiTextTextareaRefs.current[index] = el;
                    }}
                    value={item.text || ''}
                    onChange={(e) => updateMultiItem(index, { text: e.target.value })}
                    placeholder="Digite o texto..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    rows={3}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <MediaSelector
                    value={item.mediaUrl}
                    onChange={(url) => updateMultiItem(index, { mediaUrl: url })}
                    onRemove={() => updateMultiItem(index, { mediaUrl: undefined })}
                  />
                  {item.mediaUrl && (
                    <div>
                      <div className="flex items-center justify-end mb-2">
                        <EmojiPickerButton
                          onEmojiSelect={(emoji) => {
                            const textarea = multiCaptionTextareaRefs.current[index];
                            if (textarea) {
                              const start = textarea.selectionStart || 0;
                              const end = textarea.selectionEnd || 0;
                              const caption = item.caption || '';
                              const newCaption = caption.slice(0, start) + emoji + caption.slice(end);
                              updateMultiItem(index, { caption: newCaption });
                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + emoji.length, start + emoji.length);
                              }, 0);
                            } else {
                              updateMultiItem(index, { caption: (item.caption || '') + emoji });
                            }
                          }}
                          textareaRef={multiCaptionTextareaRefs.current[index] ? { current: multiCaptionTextareaRefs.current[index] } : undefined}
                        />
                      </div>
                      <textarea
                        ref={(el) => {
                          multiCaptionTextareaRefs.current[index] = el;
                        }}
                        value={item.caption || ''}
                        onChange={(e) => updateMultiItem(index, { caption: e.target.value })}
                        placeholder="Legenda (opcional)..."
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview */}
      {(content.text || content.mediaUrl || (content.items && content.items.length > 0)) && (
        <div className="mt-6 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Preview</h3>
          <div className="space-y-2">
            {content.type === 'TEXT' && content.text && (
              <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{content.text}</p>
              </div>
            )}
            {content.type === 'MEDIA' && content.mediaUrl && (
              <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                {content.mediaType === 'IMAGE' && (
                  <img src={content.mediaUrl} alt="Preview" className="max-w-full rounded" />
                )}
                {content.mediaType === 'VIDEO' && (
                  <video src={content.mediaUrl} controls className="max-w-full rounded" />
                )}
                {content.mediaType === 'AUDIO' && (
                  <audio src={content.mediaUrl} controls className="w-full" />
                )}
                {content.caption && (
                  <p className="mt-2 text-gray-700 dark:text-gray-300">{content.caption}</p>
                )}
              </div>
            )}
            {content.type === 'MULTI' &&
              content.items?.map((item, index) => (
                <div
                  key={index}
                  className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                >
                  {item.type === 'TEXT' && item.text && (
                    <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{item.text}</p>
                  )}
                  {item.type === 'MEDIA' && item.mediaUrl && (
                    <>
                      {item.mediaType === 'IMAGE' && (
                        <img src={item.mediaUrl} alt="Preview" className="max-w-full rounded" />
                      )}
                      {item.mediaType === 'VIDEO' && (
                        <video src={item.mediaUrl} controls className="max-w-full rounded" />
                      )}
                      {item.mediaType === 'AUDIO' && (
                        <audio src={item.mediaUrl} controls className="w-full" />
                      )}
                      {item.caption && (
                        <p className="mt-2 text-gray-700 dark:text-gray-300">{item.caption}</p>
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

