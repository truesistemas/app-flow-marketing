/**
 * Tipos relacionados a Campanhas (Frontend)
 */

export interface CampaignMessageContent {
  type: 'TEXT' | 'MEDIA' | 'MULTI'; // Tipo de conteúdo
  text?: string; // Texto da mensagem (suporta variáveis {{nome}}, {{telefone}})
  mediaType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  mediaUrl?: string; // URL da mídia (se type = MEDIA)
  caption?: string; // Legenda para mídia
  items?: Array<{ // Para conteúdo MULTI (texto + mídia)
    type: 'TEXT' | 'MEDIA';
    text?: string;
    mediaType?: string;
    mediaUrl?: string;
    caption?: string;
  }>;
}

