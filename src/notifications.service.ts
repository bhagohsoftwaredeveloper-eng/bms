import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { EventsService } from './events.service';
import { PushService } from './push.service';

export type CreateNotification = {
  userId: string;
  title: string;
  body: string;
  eventType: string;
  data?: Prisma.InputJsonValue;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly push: PushService,
  ) {}

  /**
   * Persist a notification for a user and push it to their live SSE stream.
   * Domain services call this directly (e.g. "you were assigned a job").
   * Failures are swallowed so a notification never breaks the main action.
   */
  async notify(input: CreateNotification) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          title: input.title,
          body: input.body,
          eventType: input.eventType,
          data: input.data,
        },
      });

      this.events.emitToUser({
        userId: notification.userId,
        id: notification.id,
        title: notification.title,
        body: notification.body,
        eventType: notification.eventType,
        data: notification.data,
        createdAt: notification.createdAt.toISOString(),
      });

      // Fire-and-forget device push (no-op when FCM isn't configured).
      void this.push.sendToUser(notification.userId, {
        title: notification.title,
        body: notification.body,
        data: {
          eventType: notification.eventType,
          ...(input.data && typeof input.data === 'object' ? input.data : {}),
        },
      });

      return notification;
    } catch {
      return null;
    }
  }

  /** Fan-out the same notification to many users (e.g. all admins). */
  async notifyMany(userIds: string[], input: Omit<CreateNotification, 'userId'>) {
    const unique = [...new Set(userIds)];
    await Promise.all(unique.map((userId) => this.notify({ ...input, userId })));
  }

  /** Helper: notify every active user holding a given role. */
  async notifyRole(role: Prisma.UserWhereInput['role'], input: Omit<CreateNotification, 'userId'>) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role },
      select: { id: true },
    });
    await this.notifyMany(
      users.map((u) => u.id),
      input,
    );
  }

  list(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException(`Notification ${id} not found`);
    if (notification.userId !== userId) {
      throw new ForbiddenException('Not your notification');
    }
    if (notification.readAt) return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
