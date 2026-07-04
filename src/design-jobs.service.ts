import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DesignJobStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { NotificationsService } from './notifications.service';
import { AddDesignJobUpdateDto } from './add-design-job-update.dto';
import { AssignDesignJobDto } from './assign-design-job.dto';
import { CreateDesignJobDto } from './create-design-job.dto';

const INCLUDE_DETAIL = {
  designer: { select: { id: true, fullName: true } },
  operator: { select: { id: true, fullName: true } },
  updates: {
    include: { author: { select: { id: true, fullName: true, role: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class DesignJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateDesignJobDto, designerId: string) {
    if (dto.operatorId) {
      await this.assertOperator(dto.operatorId);
    }

    return this.prisma.designJob.create({
      data: {
        ...dto,
        designerId,
        status: dto.operatorId ? DesignJobStatus.ASSIGNED : DesignJobStatus.PENDING,
      },
      include: INCLUDE_DETAIL,
    });
  }

  findAll(userId: string, role: UserRole) {
    const where: Prisma.DesignJobWhereInput = {};
    if (role === UserRole.DESIGNER) {
      where.designerId = userId;
    } else if (role === UserRole.MACHINE_OPERATOR) {
      where.operatorId = userId;
    }

    return this.prisma.designJob.findMany({
      where,
      include: INCLUDE_DETAIL,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, role: UserRole) {
    const job = await this.prisma.designJob.findUnique({
      where: { id },
      include: INCLUDE_DETAIL,
    });

    if (!job) {
      throw new NotFoundException(`Design job ${id} not found`);
    }

    this.assertVisible(job, userId, role);
    return job;
  }

  async assign(id: string, dto: AssignDesignJobDto, user: { id: string; role: UserRole }) {
    const job = await this.findRaw(id);
    this.assertManaged(job, user);
    const operator = await this.assertOperator(dto.operatorId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.designJob.update({
        where: { id },
        data: {
          operatorId: dto.operatorId,
          status: job.status === DesignJobStatus.PENDING ? DesignJobStatus.ASSIGNED : job.status,
        },
        include: INCLUDE_DETAIL,
      });

      await tx.designJobUpdate.create({
        data: {
          designJobId: id,
          authorId: user.id,
          message: `Assigned to ${operator.fullName}`,
          status: updated.status,
        },
      });

      return tx.designJob.findUnique({ where: { id }, include: INCLUDE_DETAIL });
    }).then(async (result) => {
      await this.notifications.notify({
        userId: dto.operatorId,
        title: 'New design job assigned',
        body: `You've been assigned the design job "${job.title}".`,
        eventType: 'design_job_assigned',
        data: { designJobId: id, route: '/design-jobs' },
      });
      return result;
    });
  }

  async addUpdate(id: string, dto: AddDesignJobUpdateDto, user: { id: string; role: UserRole }) {
    const job = await this.findRaw(id);
    this.assertVisible(job, user.id, user.role);

    if (!dto.message && !dto.status) {
      throw new ForbiddenException('Provide a message or a status update');
    }

    if (user.role === UserRole.ADMIN_STAFF && dto.status) {
      throw new ForbiddenException('Admin staff can only add comments, not change status');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.designJobUpdate.create({
        data: {
          designJobId: id,
          authorId: user.id,
          message: dto.message,
          status: dto.status,
        },
      });

      if (dto.status) {
        await tx.designJob.update({ where: { id }, data: { status: dto.status } });
      }

      return tx.designJob.findUnique({ where: { id }, include: INCLUDE_DETAIL });
    });
  }

  listOperators() {
    return this.prisma.user.findMany({
      where: { role: UserRole.MACHINE_OPERATOR, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  private async assertOperator(operatorId: string) {
    const operator = await this.prisma.user.findUnique({ where: { id: operatorId } });
    if (!operator || operator.role !== UserRole.MACHINE_OPERATOR) {
      throw new NotFoundException('Machine operator not found');
    }
    return operator;
  }

  private findRaw(id: string) {
    return this.prisma.designJob.findUnique({ where: { id } }).then((job) => {
      if (!job) {
        throw new NotFoundException(`Design job ${id} not found`);
      }
      return job;
    });
  }

  private assertVisible(
    job: { designerId: string; operatorId: string | null },
    userId: string,
    role: UserRole,
  ) {
    if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN_STAFF) return;
    if (role === UserRole.DESIGNER && job.designerId === userId) return;
    if (role === UserRole.MACHINE_OPERATOR && job.operatorId === userId) return;
    throw new ForbiddenException('You do not have access to this design job');
  }

  private assertManaged(job: { designerId: string }, user: { id: string; role: UserRole }) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (user.role === UserRole.DESIGNER && job.designerId === user.id) return;
    throw new ForbiddenException('You do not have access to this design job');
  }
}
