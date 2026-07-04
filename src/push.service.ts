import { readFileSync } from 'node:fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApp, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { PrismaService } from './prisma.service';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/**
 * Firebase Cloud Messaging wrapper. If no service-account credentials are
 * configured, every method becomes a safe no-op — the rest of the app
 * (persisted notifications + live SSE) keeps working unchanged. Drop in
 * credentials via FIREBASE_SERVICE_ACCOUNT(_PATH) to enable real device push.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private messaging: Messaging | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const credential = this.loadCredential();
    if (!credential) {
      this.logger.log('FCM disabled (no FIREBASE_SERVICE_ACCOUNT configured) — push is a no-op.');
      return;
    }
    try {
      const app = getApps().length
        ? getApp()
        : initializeApp({ credential: cert(credential) });
      this.messaging = getMessaging(app);
      this.logger.log('FCM enabled — device push notifications active.');
    } catch (err) {
      this.logger.error(`FCM init failed, push disabled: ${(err as Error).message}`);
    }
  }

  get enabled(): boolean {
    return this.messaging !== null;
  }

  /** Send a push to every registered device of a user. Prunes dead tokens. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.messaging) return;

    const devices = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (devices.length === 0) return;

    const tokens = devices.map((d) => d.token);
    const data = this.stringifyData(payload.data);

    try {
      const res = await this.messaging.sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data,
      });

      const dead: string[] = [];
      res.responses.forEach((r, i) => {
        const code = r.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          dead.push(tokens[i]);
        }
      });
      if (dead.length) {
        await this.prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
      }
    } catch (err) {
      this.logger.warn(`Push send failed for user ${userId}: ${(err as Error).message}`);
    }
  }

  /** Register (or refresh) a device token for a user. */
  async registerToken(userId: string, token: string, platform?: string) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }

  async unregisterToken(token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
    return { success: true };
  }

  private stringifyData(data?: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    if (!data) return out;
    for (const [k, v] of Object.entries(data)) {
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
  }

  private loadCredential(): ServiceAccount | null {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
    if (raw && raw.trim()) {
      try {
        return JSON.parse(raw) as ServiceAccount;
      } catch {
        this.logger.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
        return null;
      }
    }
    const path = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    if (path && path.trim()) {
      try {
        return JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount;
      } catch (err) {
        this.logger.error(`Could not read FIREBASE_SERVICE_ACCOUNT_PATH: ${(err as Error).message}`);
        return null;
      }
    }
    return null;
  }
}
