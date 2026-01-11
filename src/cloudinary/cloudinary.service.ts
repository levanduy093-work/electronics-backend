import { Injectable } from '@nestjs/common';
import { UploadApiErrorResponse, UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  async uploadImage(
    file: Express.Multer.File,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: 'electronics-shop',
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Upload to Cloudinary failed - No result returned'));
          resolve(result);
        },
      );
      streamifier.createReadStream(file.buffer).pipe(upload);
    });
  }
}
