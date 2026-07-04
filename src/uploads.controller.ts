import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UPLOAD_DIR, UploadsService } from './uploads.service';

const ALLOWED_MIME = /^image\/(jpeg|png|gif|webp)$/;

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('images')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.test(file.mimetype)) {
          cb(new BadRequestException('Only image files (JPEG, PNG, GIF, WEBP) are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFiles() files: Array<Express.Multer.File>) {
    return { urls: files.map((file) => `/api/uploads/files/${file.filename}`) };
  }

  @Get('files/:filename')
  serve(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = this.uploadsService.getFilePath(filename);
    res.sendFile(filePath);
  }
}
