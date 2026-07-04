import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DevProjectStatus,
  DevReportStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { NotificationsService } from './notifications.service';
import { AddReportFeedbackDto } from './add-report-feedback.dto';
import { CreateDevProjectDto } from './create-dev-project.dto';
import { CreateDevReportDto } from './create-dev-report.dto';
import { UpdateDevProjectDto } from './update-dev-project.dto';
import { UpdateProgressDto } from './update-progress.dto';

const INCLUDE_LIST = {
  developer: { select: { id: true, fullName: true } },
};

const INCLUDE_DETAIL = {
  developer: { select: { id: true, fullName: true } },
  sessions: { orderBy: { startedAt: 'desc' as const } },
  reports: {
    include: {
      author: { select: { id: true, fullName: true, role: true } },
      taggedAdmin: { select: { id: true, fullName: true } },
      feedback: {
        include: {
          author: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
};

@Injectable()
export class DevProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateDevProjectDto, user: { id: string; role: UserRole }) {
    let developerId = dto.developerId;
    if (user.role === UserRole.DEVELOPER) {
      developerId = user.id;
    } else if (!developerId) {
      throw new ForbiddenException('developerId is required');
    }
    await this.assertDeveloper(developerId);

    return this.prisma.devProject.create({
      data: {
        name: dto.name,
        description: dto.description,
        developerId,
        targetHours: dto.targetHours ?? null,
      },
      include: INCLUDE_DETAIL,
    });
  }

  findAll(user: { id: string; role: UserRole }) {
    const where: Prisma.DevProjectWhereInput = {};
    if (user.role === UserRole.DEVELOPER) {
      where.developerId = user.id;
    }

    return this.prisma.devProject.findMany({
      where,
      include: INCLUDE_LIST,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string, user: { id: string; role: UserRole }) {
    const project = await this.prisma.devProject.findUnique({
      where: { id },
      include: INCLUDE_DETAIL,
    });
    if (!project) {
      throw new NotFoundException(`Development project ${id} not found`);
    }
    this.assertVisible(project, user);
    return project;
  }

  async update(id: string, dto: UpdateDevProjectDto) {
    const project = await this.findRaw(id);
    if (dto.developerId && dto.developerId !== project.developerId) {
      await this.assertDeveloper(dto.developerId);
    }

    return this.prisma.devProject.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        developerId: dto.developerId,
        ...(dto.targetHours !== undefined && { targetHours: dto.targetHours }),
        ...(dto.projectStart !== undefined && { projectStart: dto.projectStart ? new Date(dto.projectStart) : null }),
        ...(dto.projectDeadline !== undefined && { projectDeadline: dto.projectDeadline ? new Date(dto.projectDeadline) : null }),
      },
      include: INCLUDE_DETAIL,
    });
  }

  async start(id: string, user: { id: string; role: UserRole }) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    if (project.status === DevProjectStatus.IN_PROGRESS) {
      throw new ForbiddenException('This project is already being worked on');
    }
    if (project.status === DevProjectStatus.COMPLETED) {
      throw new ForbiddenException('This project is already completed');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.devProjectSession.create({
        data: { projectId: id, startedAt: now },
      }),
      this.prisma.devProject.update({
        where: { id },
        data: { status: DevProjectStatus.IN_PROGRESS, startedAt: now },
      }),
    ]);

    return this.findOne(id, user);
  }

  async stop(id: string, user: { id: string; role: UserRole }) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    if (project.status !== DevProjectStatus.IN_PROGRESS || !project.startedAt) {
      throw new ForbiddenException('This project is not currently running');
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const totalMinutes = await this.closeOpenSession(tx, project, now);

      await tx.devProject.update({
        where: { id },
        data: {
          status: DevProjectStatus.PENDING,
          startedAt: null,
          totalMinutes,
        },
      });
    });

    return this.findOne(id, user);
  }

  async updateProgress(
    id: string,
    dto: UpdateProgressDto,
    user: { id: string; role: UserRole },
  ) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const data: Prisma.DevProjectUpdateInput = {
        progressPercent: dto.progressPercent,
      };

      if (dto.progressPercent >= 100) {
        data.status = DevProjectStatus.COMPLETED;
        if (project.startedAt) {
          data.totalMinutes = await this.closeOpenSession(tx, project, now);
          data.startedAt = null;
        }
      } else if (project.status === DevProjectStatus.COMPLETED) {
        data.status = DevProjectStatus.PENDING;
      }

      await tx.devProject.update({ where: { id }, data });
    });

    return this.findOne(id, user);
  }

  async addReport(
    id: string,
    dto: CreateDevReportDto,
    user: { id: string; role: UserRole },
  ) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    if (dto.taggedAdminId) {
      await this.assertReviewer(dto.taggedAdminId);
    }

    await this.prisma.devProjectReport.create({
      data: {
        projectId: id,
        authorId: user.id,
        title: dto.title,
        comment: dto.comment,
        checklist: dto.checklist as unknown as Prisma.InputJsonValue,
        taggedAdminId: dto.taggedAdminId,
      },
    });

    if (dto.taggedAdminId) {
      await this.notifications.notify({
        userId: dto.taggedAdminId,
        title: 'New dev report to review',
        body: `A report "${dto.title}" on "${project.name}" was tagged for your review.`,
        eventType: 'dev_report_tagged',
        data: { projectId: id, route: '/dev-projects' },
      });
    }

    return this.findOne(id, user);
  }

  async addFeedback(
    reportId: string,
    dto: AddReportFeedbackDto,
    user: { id: string; role: UserRole },
  ) {
    const report = await this.prisma.devProjectReport.findUnique({
      where: { id: reportId },
    });
    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    if (
      user.role !== UserRole.SUPER_ADMIN &&
      report.taggedAdminId !== user.id
    ) {
      throw new ForbiddenException('You were not tagged on this report');
    }

    await this.prisma.$transaction([
      this.prisma.devProjectReportFeedback.create({
        data: { reportId, authorId: user.id, message: dto.message },
      }),
      this.prisma.devProjectReport.update({
        where: { id: reportId },
        data: { status: DevReportStatus.REVIEWED },
      }),
    ]);

    if (report.authorId !== user.id) {
      await this.notifications.notify({
        userId: report.authorId,
        title: 'Feedback on your report',
        body: `Your report "${report.title}" received feedback.`,
        eventType: 'dev_report_feedback',
        data: { projectId: report.projectId, route: '/dev-projects' },
      });
    }

    return this.findOne(report.projectId, user);
  }

  listDevelopers() {
    return this.prisma.user.findMany({
      where: { role: UserRole.DEVELOPER, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  listReviewers() {
    return this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF] },
        isActive: true,
      },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  private async closeOpenSession(
    tx: Prisma.TransactionClient,
    project: { id: string; startedAt: Date | null; totalMinutes: number },
    now: Date,
  ): Promise<number> {
    if (!project.startedAt) return project.totalMinutes;

    const minutes = Math.max(
      0,
      Math.round((now.getTime() - project.startedAt.getTime()) / 60000),
    );
    const openSession = await tx.devProjectSession.findFirst({
      where: { projectId: project.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (openSession) {
      await tx.devProjectSession.update({
        where: { id: openSession.id },
        data: { endedAt: now, minutes },
      });
    }

    return project.totalMinutes + minutes;
  }

  private async assertDeveloper(developerId: string) {
    const developer = await this.prisma.user.findUnique({
      where: { id: developerId },
    });
    if (!developer || developer.role !== UserRole.DEVELOPER) {
      throw new NotFoundException('Developer not found');
    }
    return developer;
  }

  private async assertReviewer(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (
      !admin ||
      (admin.role !== UserRole.SUPER_ADMIN &&
        admin.role !== UserRole.ADMIN_STAFF)
    ) {
      throw new NotFoundException('Reviewer not found');
    }
    return admin;
  }

  private findRaw(id: string) {
    return this.prisma.devProject
      .findUnique({ where: { id } })
      .then((project) => {
        if (!project) {
          throw new NotFoundException(`Development project ${id} not found`);
        }
        return project;
      });
  }

  private assertVisible(
    project: { developerId: string },
    user: { id: string; role: UserRole },
  ) {
    if (
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.ADMIN_STAFF
    )
      return;
    if (project.developerId === user.id) return;
    throw new ForbiddenException(
      'You do not have access to this development project',
    );
  }

  private assertOwner(
    project: { developerId: string },
    user: { id: string; role: UserRole },
  ) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (project.developerId === user.id) return;
    throw new ForbiddenException(
      'You do not have access to this development project',
    );
  }
}
