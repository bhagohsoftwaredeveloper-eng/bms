import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EarningStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CreateEarningDto } from './create-earning.dto';

// Earnings move strictly forward: PENDING → APPROVED → PAID.
const ALLOWED_FROM: Record<EarningStatus, EarningStatus[]> = {
  [EarningStatus.PENDING]: [],
  [EarningStatus.APPROVED]: [EarningStatus.PENDING],
  [EarningStatus.PAID]: [EarningStatus.APPROVED],
};

@Injectable()
export class EarningsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateEarningDto) {
    return this.prisma.earning.create({ data: dto });
  }

  findAll(userId?: string) {
    return this.prisma.earning.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        job: {
          include: {
            client: {
              select: {
                businessName: true,
              },
            },
          },
        },
        user: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
    });
  }

  async setStatus(id: string, status: EarningStatus, actorId: string) {
    const earning = await this.prisma.earning.findUnique({ where: { id } });
    if (!earning) {
      throw new NotFoundException(`Earning ${id} not found`);
    }
    if (earning.userId === actorId) {
      throw new ForbiddenException('You cannot approve or pay out your own earning.');
    }
    if (!ALLOWED_FROM[status].includes(earning.status)) {
      throw new BadRequestException(
        `Cannot mark a ${earning.status.toLowerCase()} earning as ${status.toLowerCase()}.`,
      );
    }
    return this.prisma.earning.update({ where: { id }, data: { status } });
  }
}
