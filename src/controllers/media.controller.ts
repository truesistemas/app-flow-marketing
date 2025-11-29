import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export class MediaController {
  private prisma: PrismaClient;
  private uploadsDir: string;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    this.ensureUploadsDir();
  }

  private async ensureUploadsDir() {
    try {
      await fs.access(this.uploadsDir);
    } catch {
      await fs.mkdir(this.uploadsDir, { recursive: true });
    }
  }

  /**
   * POST /api/media/upload
   * Upload de arquivo de mídia
   */
  async uploadMedia(request: FastifyRequest, reply: FastifyReply) {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const data = await request.file();

      if (!data) {
        return reply.code(400).send({ error: 'Nenhum arquivo enviado' });
      }

      // Validar tipo de arquivo
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

      const fileType = data.mimetype || '';
      const isValidType = allowedTypes.includes(fileType) || 
        fileType.startsWith('image/') || 
        fileType.startsWith('video/') || 
        fileType.startsWith('audio/');
      
      if (!isValidType && !fileType.includes('pdf') && !fileType.includes('msword') && !fileType.includes('wordprocessingml')) {
        return reply.code(400).send({ error: 'Tipo de arquivo não permitido' });
      }

      // Validar tamanho (10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      const buffer = await data.toBuffer();
      if (buffer.length > maxSize) {
        return reply.code(400).send({ error: 'Arquivo muito grande. Tamanho máximo: 10MB' });
      }

      // Criar diretório da organização se não existir
      const orgDir = path.join(this.uploadsDir, authRequest.user.organizationId);
      try {
        await fs.access(orgDir);
      } catch {
        await fs.mkdir(orgDir, { recursive: true });
      }

      // Gerar nome único para o arquivo
      const fileExtension = path.extname(data.filename || '');
      const fileName = `${Date.now()}-${randomUUID()}${fileExtension}`;
      const filePath = path.join(orgDir, fileName);

      // Salvar arquivo
      await fs.writeFile(filePath, buffer);

      // Determinar tipo de mídia
      let mediaType = 'document';
      if (fileType.startsWith('image/')) {
        mediaType = 'image';
      } else if (fileType.startsWith('video/')) {
        mediaType = 'video';
      } else if (fileType.startsWith('audio/')) {
        mediaType = 'audio';
      }

      // Retornar URL relativa (o frontend precisará servir os arquivos ou usar um CDN)
      const url = `/uploads/${authRequest.user.organizationId}/${fileName}`;

      return reply.send({
        url,
        filename: data.filename,
        type: mediaType,
        size: buffer.length,
      });
    } catch (error: any) {
      console.error('Erro ao fazer upload de mídia:', error);
      return reply.code(500).send({ error: error.message || 'Erro ao fazer upload de mídia' });
    }
  }
}

