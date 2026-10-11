import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export class CloudinaryService {
  static async uploadImage(fileBase64: string, folder: string = 'media_kits'): Promise<string> {
    // Em ambiente de teste/simulação sem credenciais reais, retorna URL mockada
    if (env.NODE_ENV === 'test' || env.CLOUDINARY_CLOUD_NAME === 'demo') {
      return `https://res.cloudinary.com/demo/image/upload/sample_${Date.now()}.jpg`;
    }

    try {
      // Deteta se o base64 corresponde a um PDF (ex: data:application/pdf;base64 ou assinatura binária JVBERi0)
      const isPdf = fileBase64.includes('application/pdf') || fileBase64.startsWith('JVBERi0');

      const uploadOptions: any = {
        folder: `saas_mediakit/${folder}`,
        resource_type: isPdf ? 'raw' : 'image', // PDFs usam resource_type 'raw' para evitar corrupção
      };

      // Apenas aplica transformações de otimização se for estritamente uma imagem
      if (!isPdf) {
        uploadOptions.transformation = [{ quality: 'auto', fetch_format: 'auto' }];
      }

      const uploadResponse = await cloudinary.uploader.upload(fileBase64, uploadOptions);
      return uploadResponse.secure_url;
    } catch (error) {
      console.error('Erro no upload Cloudinary:', error);
      throw new Error('Falha ao realizar upload do ficheiro.');
    }
  }
}