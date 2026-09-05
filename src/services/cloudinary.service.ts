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
      const uploadResponse = await cloudinary.uploader.upload(fileBase64, {
        folder: `saas_mediakit/${folder}`,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      });
      return uploadResponse.secure_url;
    } catch (error) {
      console.error('Erro no upload Cloudinary:', error);
      throw new Error('Falha ao realizar upload da imagem.');
    }
  }
}