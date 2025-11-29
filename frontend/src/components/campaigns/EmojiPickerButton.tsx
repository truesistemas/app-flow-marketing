import { useState, useRef, useEffect } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { Smile } from 'lucide-react';

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

// Tipo para os dados do emoji (compatível com emoji-picker-react)
interface EmojiData {
  emoji: string;
  unified?: string;
  names?: string[];
  activeSkinTone?: string;
}

type Theme = 'light' | 'dark' | 'auto';

export default function EmojiPickerButton({ onEmojiSelect, textareaRef }: EmojiPickerButtonProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  
  // Detectar tema do sistema
  const getTheme = (): Theme => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPicker]);

  const handleEmojiClick = (emojiData: EmojiData) => {
    onEmojiSelect(emojiData.emoji);
    setShowPicker(false);
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        title="Inserir emoji"
      >
        <Smile className="w-5 h-5" />
      </button>
      {showPicker && (
        <div className="absolute z-50 bottom-full right-0 mb-2">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={getTheme()}
            width={350}
            height={400}
          />
        </div>
      )}
    </div>
  );
}

