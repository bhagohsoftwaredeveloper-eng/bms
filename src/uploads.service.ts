import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');
const FILENAME_RE = /^[\w-]+\.[a-z0-9]+$/i;

@Injectable()
export class UploadsService {
  constructor() {
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  getFilePath(filename: string): string {
    if (!FILENAME_RE.test(filename)) throw new NotFoundException('File not found');
    const filePath = join(UPLOAD_DIR, filename);
    if (!existsSync(filePath)) throw new NotFoundException('File not found');
    return filePath;
  }
}
