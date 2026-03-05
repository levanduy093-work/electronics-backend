import { BadRequestException, Injectable } from '@nestjs/common';
import {
  UploadApiErrorResponse,
  UploadApiResponse,
  v2 as cloudinary,
} from 'cloudinary';
import * as streamifier from 'streamifier';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

@Injectable()
export class CloudinaryService {
  private readonly maxImageFileSizeBytes = 5 * 1024 * 1024; // 5MB
  private readonly maxRawFileSizeBytes = 10 * 1024 * 1024; // 10MB for PDFs and other docs
  private readonly fetchTimeoutMs = 8000;

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
    options?: {
      format?: string;
      resourceType?: 'image' | 'raw';
    },
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    const resourceType = options?.resourceType ?? 'image';
    const format = options?.format;
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          ...(format ? { format } : {}),
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

  private isPrivateIpAddress(ip: string) {
    const ver = isIP(ip);
    if (ver === 4) {
      const [a, b] = ip.split('.').map((n) => Number(n));
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      return false;
    }
    if (ver === 6) {
      const v = ip.toLowerCase();
      if (v === '::1') return true;
      if (v.startsWith('fc') || v.startsWith('fd')) return true;
      if (v.startsWith('fe80')) return true;
      return false;
    }
    return false;
  }

  private async assertSafePublicImageUrl(rawUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException('URL ảnh không hợp lệ');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Chỉ hỗ trợ URL http/https');
    }

    const hostname = (parsed.hostname || '').toLowerCase();
    if (!hostname) {
      throw new BadRequestException('URL ảnh không hợp lệ');
    }
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname === 'metadata.google.internal' ||
      hostname === '169.254.169.254'
    ) {
      throw new BadRequestException('URL ảnh không được phép');
    }

    if (this.isPrivateIpAddress(hostname)) {
      throw new BadRequestException('URL ảnh không được phép');
    }

    let addresses: Array<{ address: string; family: number }> = [];
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new BadRequestException('Không resolve được host URL ảnh');
    }
    if (!addresses.length) {
      throw new BadRequestException('Không resolve được host URL ảnh');
    }
    if (addresses.some((a) => this.isPrivateIpAddress(a.address))) {
      throw new BadRequestException('URL ảnh trỏ vào mạng nội bộ, bị chặn');
    }
  }

  async uploadImageByUrl(
    url: string,
    folder?: string,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    await this.assertSafePublicImageUrl(url);
    const safeFolder = this.sanitizeFolder(folder);

    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      throw new BadRequestException('Không thể tải ảnh từ URL');
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new BadRequestException('Không thể tải ảnh từ URL');
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > this.maxImageFileSizeBytes
    ) {
      throw new BadRequestException('Ảnh vượt quá giới hạn 5MB');
    }

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > this.maxImageFileSizeBytes) {
      throw new BadRequestException('Ảnh vượt quá giới hạn 5MB');
    }

    const targetFormat = this.detectTargetFormat(contentType, url);
    const buffer = Buffer.from(arrayBuffer);

    return this.uploadBuffer(buffer, safeFolder, {
      format: targetFormat,
      resourceType: 'image',
    });
  }

  async uploadImage(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    const safeFolder = this.sanitizeFolder(folder);
    if (file.size > this.maxImageFileSizeBytes) {
      throw new BadRequestException('Ảnh vượt quá giới hạn 5MB');
    }
    return this.uploadBuffer(file.buffer, safeFolder, { resourceType: 'image' });
  }

  async uploadRawFile(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    const safeFolder = this.sanitizeFolder(folder);
    if (file.size > this.maxRawFileSizeBytes) {
      throw new BadRequestException('File vượt quá giới hạn 10MB');
    }
    // Chỉ cho phép PDF nên set format cố định là 'pdf' để Cloudinary nhận diện đúng
    return this.uploadBuffer(file.buffer, safeFolder, {
      resourceType: 'raw',
      format: 'pdf',
    });
  }
}
