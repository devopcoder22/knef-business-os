/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import type { Request } from 'express';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

@ApiTags('uploads')
@ApiBearerAuth('JWT')
@Controller('uploads')
export class UploadsController {
  @Post('image')
  @ApiOperation({ summary: 'Upload a product image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, cb: any) => {
          const uploadDir = process.env.UPLOAD_DIR ?? '/app/uploads';
          const dest = join(uploadDir, 'products');
          mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename: (_req: any, file: any, cb: any) => {
          const ext = extname(file.originalname as string).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      fileFilter: (_req: any, file: any, cb: any) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype as string)) {
          return cb(new BadRequestException('Only image files are allowed (JPEG, PNG, WebP, GIF, AVIF)'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadImage(@UploadedFile() file: any, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file provided');
    const url = `${req.protocol}://${req.get('host')}/uploads/products/${file.filename as string}`;
    return { url };
  }
}
