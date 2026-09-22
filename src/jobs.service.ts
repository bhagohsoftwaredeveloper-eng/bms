import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, LicenseStatus, Prisma } from '@prisma/client';
import { EarningsService } from './earnings.service';
import { PrismaService } from './prisma.service';
import { NotificationsService } from './notifications.service';
import { AssignInstallerDto } from './assign-installer.dto';
import { CreateJobDto } from './create-job.dto';
import { SubmitProofDto } from './submit-proof.dto';
import { UpdateJobStatusDto } from './update-job-status.dto';
import { UpdateJobDto } from './update-job.dto';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly earnings: EarningsService,
  ) {}

  async create(dto: CreateJobDto) {
    const installerIds = dto.installerIds ?? [];
    const primaryInstallerId = installerIds[0];
    const job = await this.prisma.job.create({
      data: {
        clientId: dto.clientId,
        installerId: primaryInstallerId,
        licenseId: dto.licenseId,
        scheduleDate: dto.scheduleDate,
        remarks: dto.remarks,
        jobStatus: primaryInstallerId ? JobStatus.ASSIGNED : undefined,
      },
      include: { client: true },
    });
    if (installerIds.length > 0) {
      await this.prisma.jobInstaller.createMany({
        data: installerIds.map((userId) => ({ jobId: job.id, userId })),
      });
      await this.notifyAssignment(job.id, installerIds, job.client.businessName);
    }
    return job;
  }

  findAll(userId?: string, role?: string) {
    const where: Prisma.JobWhereInput = {};
    if (userId) {
      if (role === 'INSTALLER') {
        // Also match legacy/gap jobs that have a primary installerId but no
        // roster rows yet, so they stay visible to their installer.
        where.OR = [
          { installers: { some: { userId } } },
          { installerId: userId, installers: { none: {} } },
        ];
      }
    }

    return this.prisma.job.findMany({
      where,
      orderBy: { scheduleDate: 'desc' },
      include: {
        client: true,
        installer: true,
        license: true,
        proof: true,
        installers: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        client: true,
        installer: true,
        license: true,
        proof: true,
        jobOrder: true,
        installers: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }

    return job;
  }

  /** Replaces a job's assigned installers: sets the primary installerId to the
   *  first id and rewrites its JobInstaller rows to exactly this list. Only
   *  the explicit "Assign" action should flip the job to ASSIGNED — a plain
   *  edit (e.g. changing remarks) must never move a COMPLETED job backwards. */
  private async setInstallers(jobId: string, installerIds: string[], options: { setAssignedStatus?: boolean } = {}) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({
        where: { id: jobId },
        data: {
          installerId: installerIds[0] ?? null,
          ...(options.setAssignedStatus && installerIds[0] ? { jobStatus: JobStatus.ASSIGNED } : {}),
        },
      });
      await tx.jobInstaller.deleteMany({ where: { jobId } });
      if (installerIds.length > 0) {
        await tx.jobInstaller.createMany({ data: installerIds.map((userId) => ({ jobId, userId })) });
      }
      return updated;
    });
  }

  async assignInstaller(id: string, dto: AssignInstallerDto) {
    const job = await this.findOne(id);
    const updated = await this.setInstallers(id, dto.installerIds, { setAssignedStatus: true });
    await this.notifyAssignment(id, dto.installerIds, job.client.businessName);
    return updated;
  }

  async update(id: string, dto: UpdateJobDto) {
    await this.findOne(id);
    await this.prisma.job.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        scheduleDate: dto.scheduleDate,
        remarks: dto.remarks ?? null,
      },
    });
    if (dto.installerIds !== undefined) {
      // Plain edit: sync the installer list only, never touch jobStatus.
      await this.setInstallers(id, dto.installerIds ?? []);
    }
    return this.findOne(id);
  }

  private notifyAssignment(jobId: string, installerIds: string[], clientName: string) {
    return Promise.all(
      installerIds.map((userId) =>
        this.notifications.notify({
          userId,
          title: 'New installation job assigned',
          body: `You've been assigned an installation job for ${clientName}.`,
          eventType: 'job_assigned',
          data: { jobId, route: '/jobs' },
        }),
      ),
    );
  }

  async updateStatus(id: string, userId: string, role: string, dto: UpdateJobStatusDto) {
    const job = await this.findOne(id);
    
    // Authorization check
    // Fall back to installerId equality when installers is empty/undefined
    // (legacy jobs with no JobInstaller rows yet) — note `job.installers` is
    // always an array (never undefined) from findOne()'s include, so a plain
    // `?? ` on `.some()`'s boolean result would never trigger for [] and must
    // be avoided here.
    const isAssignedInstaller = job.installers && job.installers.length > 0
      ? job.installers.some((row) => row.userId === userId)
      : job.installerId === userId;
    if (role === 'INSTALLER' && !isAssignedInstaller) {
      throw new ForbiddenException('You are not assigned to this job');
    }
    // Operators can update any job status for now (usually those they are working on)

    // A job cannot be completed until its license has been activated. Jobs are
    // not always linked to a specific license, so accept either the directly
    // linked license OR any activated license belonging to the job's client.
    if (dto.jobStatus === JobStatus.COMPLETED) {
      let hasActivatedLicense = job.license?.status === LicenseStatus.ACTIVATED;
      if (!hasActivatedLicense) {
        const activatedCount = await this.prisma.license.count({
          where: { clientId: job.clientId, status: LicenseStatus.ACTIVATED },
        });
        hasActivatedLicense = activatedCount > 0;
      }
      if (!hasActivatedLicense) {
        throw new BadRequestException(
          'Cannot complete this job: the license has not been activated yet. ' +
            'Please wait for the license to be activated before completing the task.',
        );
      }
    }

    return this.prisma.job.update({
      where: { id },
      data: { jobStatus: dto.jobStatus, remarks: dto.remarks ?? job.remarks },
    });
  }

  /**
   * Installer uploads proof of installation (signature, photos, device info, GPS,
   * timestamp) and the job moves to WAITING_ACTIVATION so a developer can pick it up.
   */
  async submitProof(id: string, installerId: string, dto: SubmitProofDto) {
    const job = await this.assertOwnedByInstaller(id, installerId);
    const deviceInfo = dto.deviceInfo as Prisma.InputJsonValue | undefined;
    const photoUrls = dto.photoUrls as Prisma.InputJsonValue;

    await this.prisma.installationProof.upsert({
      where: { jobId: job.id },
      create: {
        jobId: job.id,
        clientSignature: dto.clientSignature,
        photoUrls,
        deviceInfo,
        gpsLatitude: dto.gpsLatitude,
        gpsLongitude: dto.gpsLongitude,
      },
      update: {
        clientSignature: dto.clientSignature,
        photoUrls,
        deviceInfo,
        gpsLatitude: dto.gpsLatitude,
        gpsLongitude: dto.gpsLongitude,
        capturedAt: new Date(),
      },
    });

    const updated = await this.prisma.job.update({
      where: { id: job.id },
      data: { jobStatus: JobStatus.WAITING_ACTIVATION },
      include: { proof: true },
    });

    // A pricing problem must never block the installer's proof submission.
    try {
      await this.earnings.ensureInstallationEarning(job.id);
    } catch (err) {
      this.logger.error(`Could not create installation earning for job ${job.id}`, err instanceof Error ? err.stack : String(err));
    }

    return updated;
  }

  findByMonth(month: number, year: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    return this.prisma.job.findMany({
      where: {
        scheduleDate: { gte: start, lt: end },
      },
      select: {
        id: true,
        scheduleDate: true,
        jobStatus: true,
      },
      orderBy: { scheduleDate: 'asc' },
    });
  }

  findByDate(date: string) {
    const day = new Date(date);
    const next = new Date(date);
    next.setDate(next.getDate() + 1);

    return this.prisma.job.findMany({
      where: {
        scheduleDate: { gte: day, lt: next },
      },
      orderBy: { scheduleDate: 'asc' },
      include: { client: true, installer: true, license: true, proof: true },
    });
  }

  private async assertOwnedByInstaller(id: string, installerId: string) {
    const job = await this.findOne(id);
    // Fall back to installerId equality when installers is empty/undefined
    // (legacy jobs with no JobInstaller rows yet) — see note in updateStatus.
    const isAssigned = job.installers && job.installers.length > 0
      ? job.installers.some((row) => row.userId === installerId)
      : job.installerId === installerId;
    if (!isAssigned) {
      throw new ForbiddenException('You are not assigned to this job');
    }
    return job;
  }
}
