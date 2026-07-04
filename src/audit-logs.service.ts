import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface RecordAuditLogInput {
  userId?: string;
  action: string;
  ipAddress?: string;
  device?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        ipAddress: input.ipAddress,
        device: input.device,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        user: input.userId ? { connect: { id: input.userId } } : undefined,
      },
    });
  }

  findAll(userId?: string) {
    return this.prisma.auditLog.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  }
}
