import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// On Railway, a Volume attached to this service injects RAILWAY_VOLUME_MOUNT_PATH —
// use it so uploads persist across deploys/restarts. Falls back to a local dir in dev.
export const UPLOAD_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? join(process.cwd(), 'uploads');
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
