import { Injectable, NotFoundException } from '@nestjs/common';
import { EarningStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CreateEarningDto } from './create-earning.dto';

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

  async setStatus(id: string, status: EarningStatus) {
    const earning = await this.prisma.earning.findUnique({ where: { id } });
    if (!earning) {
      throw new NotFoundException(`Earning ${id} not found`);
    }
    return this.prisma.earning.update({ where: { id }, data: { status } });
  }
}
