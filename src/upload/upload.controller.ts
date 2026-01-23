import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Query,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UploadImageByUrlDto } from './dto/upload-by-url.dto';

const sanitizeFolder = (value?: string) => {
  if (!value) return undefined;
  // Allow only alphanum, slash, dash, underscore to avoid traversal or special chars
  const cleaned = value.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\/+/g, '/');
  return cleaned || undefined;
};

@Controller('upload')
export class UploadController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg)' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('folder') folder?: string,
  ) {
    const safeFolder = sanitizeFolder(folder);
    return this.cloudinaryService.uploadImage(file, safeFolder);
  }

  @Post('image/by-url')
  async uploadImageByUrl(
    @Body() body: UploadImageByUrlDto,
    @Query('folder') folder?: string,
  ) {
    const safeFolder = sanitizeFolder(folder);
    return this.cloudinaryService.uploadImageByUrl(body.url, safeFolder);
  }

  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 10 }), // 10MB
          new FileTypeValidator({ fileType: '.(pdf)' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('folder') folder?: string,
  ) {
    const safeFolder = sanitizeFolder(folder);
    return this.cloudinaryService.uploadRawFile(file, safeFolder);
  }
}
