import { BadRequestException, Injectable } from '@nestjs/common';
import {
  UploadApiErrorResponse,
  UploadApiResponse,
  v2 as cloudinary,
} from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  private readonly maxFileSizeBytes = 5 * 1024 * 1024; // 5MB

  private buildFallbackFolder() {
    const now = new Date();
    return `electronics-shop/uploads/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private sanitizeFolder(folder?: string) {
    const fallbackFolder = this.buildFallbackFolder();
    if (!folder) return fallbackFolder;
    const cleaned = folder
      .replace(/[^a-zA-Z0-9/_-]/g, '')
      .replace(/\/+/g, '/')
      .trim();
    return cleaned || fallbackFolder;
  }

  private uploadBuffer(
    buffer: Buffer,
    folder: string,
    format?: 'jpg' | 'jpeg' | 'png',
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          format,
        },
        (error, result) => {
          if (error) return reject(new Error(error.message));
          if (!result)
            return reject(
              new Error('Upload to Cloudinary failed - No result returned'),
            );
          resolve(result);
        },
      );
      streamifier.createReadStream(buffer).pipe(upload);
    });
  }

  private detectTargetFormat(contentType: string, url: string): 'jpg' | 'png' {
    const normalizedContentType = contentType
      .split(';')[0]
      .trim()
      .toLowerCase();
    const map: Record<string, 'jpg' | 'png'> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'jpg', // convert to jpg for compatibility
    };

    if (map[normalizedContentType]) return map[normalizedContentType];

    const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
    if (ext === 'png') return 'png';
    if (['jpg', 'jpeg', 'webp'].includes(ext)) return 'jpg';

    throw new BadRequestException('URL phải là ảnh định dạng jpg hoặc png');
  }

  async uploadImage(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    const safeFolder = this.sanitizeFolder(folder);
    return this.uploadBuffer(file.buffer, safeFolder);
  }

  async uploadImageByUrl(
    url: string,
    folder?: string,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    const safeFolder = this.sanitizeFolder(folder);

    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new BadRequestException('Không thể tải ảnh từ URL');
    }

    if (!response.ok) {
      throw new BadRequestException('Không thể tải ảnh từ URL');
    }

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > this.maxFileSizeBytes) {
      throw new BadRequestException('Ảnh vượt quá giới hạn 5MB');
    }

    const targetFormat = this.detectTargetFormat(contentType, url);
    const buffer = Buffer.from(arrayBuffer);

    return this.uploadBuffer(buffer, safeFolder, targetFormat);
  }
}
