import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BACKUP_DIR = join(process.cwd(), 'backups');
const FILENAME_RE = /^[\w.-]+\.sql$/;

function resolveMysqldumpPath(): string {
  if (process.env.MYSQLDUMP_PATH) return process.env.MYSQLDUMP_PATH;

  if (process.platform === 'win32') {
    const mysqlRoot = 'C:\\Program Files\\MySQL';
    try {
      for (const dir of readdirSync(mysqlRoot)) {
        const candidate = join(mysqlRoot, dir, 'bin', 'mysqldump.exe');
        if (existsSync(candidate)) return candidate;
      }
    } catch {
      // MySQL not installed under the default Program Files location — fall back to PATH
    }
  }

  return 'mysqldump';
}

/**
 * Turn a raw child-process failure into a human-readable reason. Distinguishes a
 * genuinely missing binary (ENOENT) from a runtime dump error (which carries the
 * real cause on stderr — e.g. auth failure or a MySQL-version incompatibility on
 * the Railway MySQL 8 server), so the diagnosis isn't a guess.
 */
export function describeBackupError(err: unknown, bin: string): string {
  const e = err as (NodeJS.ErrnoException & { stderr?: string | Buffer }) | undefined;
  if (e?.code === 'ENOENT') {
    return `mysqldump executable not found (looked for "${bin}"). Install the MySQL client on the server — on Railway ensure nixpacks.toml lists "default-mysql-client", or set MYSQLDUMP_PATH.`;
  }
  const stderr = e?.stderr?.toString().trim();
  return stderr || e?.message || 'Unknown error while running mysqldump';
}

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: Date;
}

@Injectable()
export class BackupsService {
  constructor() {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  }

  list(): BackupFile[] {
    return readdirSync(BACKUP_DIR)
      .filter((name) => FILENAME_RE.test(name))
      .map((filename) => {
        const stats = statSync(join(BACKUP_DIR, filename));
        return { filename, size: stats.size, createdAt: stats.birthtime };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(): Promise<BackupFile> {
    const dbUrl = new URL(process.env.DATABASE_URL!);
    const dbName = dbUrl.pathname.replace(/^\//, '');
    const host = dbUrl.hostname;
    const port = dbUrl.port || '3306';
    const user = decodeURIComponent(dbUrl.username);
    const password = decodeURIComponent(dbUrl.password);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `sdlmp-${timestamp}.sql`;
    const outputPath = join(BACKUP_DIR, filename);
    const bin = resolveMysqldumpPath();

    try {
      await execFileAsync(
        bin,
        [
          '-h', host,
          '-P', port,
          '-u', user,
          '--single-transaction',
          '--routines',
          `--result-file=${outputPath}`,
          dbName,
        ],
        { env: { ...process.env, MYSQL_PWD: password } },
      );
    } catch (err) {
      const detail = describeBackupError(err, bin);
      new Logger(BackupsService.name).error(`Backup failed: ${detail}`);
      // Clean up any partial/empty result file mysqldump may have left behind.
      if (existsSync(outputPath)) unlinkSync(outputPath);
      throw new InternalServerErrorException(`Backup failed: ${detail}`);
    }

    const stats = statSync(outputPath);
    return { filename, size: stats.size, createdAt: stats.birthtime };
  }

  get(filename: string): BackupFile {
    const filePath = this.getFilePath(filename);
    const stats = statSync(filePath);
    return { filename, size: stats.size, createdAt: stats.birthtime };
  }

  getFilePath(filename: string): string {
    if (!FILENAME_RE.test(filename)) throw new NotFoundException('Backup not found');
    const filePath = join(BACKUP_DIR, filename);
    if (!existsSync(filePath)) throw new NotFoundException('Backup not found');
    return filePath;
  }

  remove(filename: string): { filename: string } {
    const filePath = this.getFilePath(filename);
    unlinkSync(filePath);
    return { filename };
  }

  /** Nightly 3 AM backup; keeps the newest 14 dumps and prunes the rest. */
  @Cron('0 3 * * *')
  async scheduledBackup(): Promise<void> {
    const logger = new Logger(BackupsService.name);
    try {
      const file = await this.create();
      logger.log(`Nightly backup created: ${file.filename} (${Math.round(file.size / 1024)} KB)`);
      for (const old of this.list().slice(14)) {
        unlinkSync(join(BACKUP_DIR, old.filename));
        logger.log(`Pruned old backup: ${old.filename}`);
      }
    } catch (err) {
      logger.error(`Nightly backup failed: ${(err as Error).message}`);
    }
  }
}
