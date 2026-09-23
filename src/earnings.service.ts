import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EarningStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { EventsService } from './events.service';
import { CreateEarningDto } from './create-earning.dto';
import { computeInstallationEarning, splitInstallationEarning, type InstallationRates, type TagumLocation } from './installation-earning.util';
import type { UpdateInstallationRatesDto } from './update-installation-rates.dto';

const LOCATIONS: TagumLocation[] = ['INSIDE_TAGUM', 'OUTSIDE_TAGUM'];

// Earnings move strictly forward: PENDING → APPROVED → PAID.
const ALLOWED_FROM: Record<EarningStatus, EarningStatus[]> = {
  [EarningStatus.PENDING]: [],
  [EarningStatus.APPROVED]: [EarningStatus.PENDING],
  [EarningStatus.PAID]: [EarningStatus.APPROVED],
};

@Injectable()
export class EarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

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

  async getInstallationRates(): Promise<InstallationRates> {
    const rows = await this.prisma.installationRate.findMany();
    const rates = {
      INSIDE_TAGUM: { baseAmount: 0, extraAmount: 0 },
      OUTSIDE_TAGUM: { baseAmount: 0, extraAmount: 0 },
    } as InstallationRates;
    for (const row of rows) {
      rates[row.location as TagumLocation] = { baseAmount: Number(row.baseAmount), extraAmount: Number(row.extraAmount) };
    }
    return rates;
  }

  /** Flat SOFTWARE-only bonus for setting up the POS backoffice extension — same regardless of location. */
  async getBackofficeExtensionAmount(): Promise<number> {
    const row = await this.prisma.backofficeExtensionRate.findUnique({ where: { id: 1 } });
    return row ? Number(row.amount) : 0;
  }

  /** Everything the Installation Rates settings card reads and writes, bundled into one response. */
  async getPricingSettings(): Promise<InstallationRates & { backofficeExtensionAmount: number }> {
    const [rates, backofficeExtensionAmount] = await Promise.all([
      this.getInstallationRates(),
      this.getBackofficeExtensionAmount(),
    ]);
    return { ...rates, backofficeExtensionAmount };
  }

  async saveInstallationRates(dto: UpdateInstallationRatesDto): Promise<InstallationRates & { backofficeExtensionAmount: number }> {
    await this.prisma.$transaction([
      ...LOCATIONS.map((location) =>
        this.prisma.installationRate.upsert({
          where: { location },
          create: { location, baseAmount: dto[location].baseAmount, extraAmount: dto[location].extraAmount },
          update: { baseAmount: dto[location].baseAmount, extraAmount: dto[location].extraAmount },
        }),
      ),
      this.prisma.backofficeExtensionRate.upsert({
        where: { id: 1 },
        create: { id: 1, amount: dto.backofficeExtensionAmount },
        update: { amount: dto.backofficeExtensionAmount },
      }),
    ]);
    return this.getPricingSettings();
  }

  /**
   * Creates the PENDING INSTALLATION earning(s) for a job once, priced from the
   * client's address (inside/outside Tagum) and number of licensed computers.
   * When 2+ installers are assigned (via JobInstaller), the total is split
   * equally between them; with none assigned to the join table yet, it falls
   * back to the single `installerId` earner (legacy behavior). CCTV/signage
   * jobs are skipped: their labor earning comes from the job order.
   */
  async ensureInstallationEarning(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        client: { select: { address: true } },
        jobOrder: { select: { type: true, includesBackofficeExtension: true } },
      },
    });
    if (!job?.installerId) return null;
    if (job.jobOrder && job.jobOrder.type !== 'SOFTWARE') return null;

    const existing = await this.prisma.earning.findFirst({ where: { jobId, type: 'INSTALLATION' } });
    if (existing) return null;

    const [rates, licenseCount, jobInstallers, backofficeExtensionAmount] = await Promise.all([
      this.getInstallationRates(),
      this.prisma.license.count({ where: { clientId: job.clientId, voidedAt: null } }),
      this.prisma.jobInstaller.findMany({ where: { jobId }, select: { userId: true } }),
      this.getBackofficeExtensionAmount(),
    ]);
    const { amount, note } = computeInstallationEarning({
      address: job.client.address,
      licenseCount,
      rates,
      backofficeExtension: { included: !!job.jobOrder?.includesBackofficeExtension, amount: backofficeExtensionAmount },
    });
    if (amount <= 0) return null;

    const installerIds = jobInstallers.length > 0 ? jobInstallers.map((row) => row.userId) : [job.installerId];
    const shares = splitInstallationEarning(amount, installerIds.length);
    const noteFor = (share: number) =>
      installerIds.length > 1 ? `${note} · Split ${installerIds.length} ways: ₱${share.toFixed(2)} each` : note;

    const created = await this.prisma.$transaction(
      installerIds.map((userId, index) =>
        this.prisma.earning.create({
          data: { userId, jobId, amount: shares[index], type: 'INSTALLATION', note: noteFor(shares[index]) },
        }),
      ),
    );

    // This earning is created internally (from the installer's proof submission,
    // not a request to /earnings), so the audit-log interceptor never sees it and
    // never fires its usual broadcast. Emit it here instead, so the admin
    // sidebar's Earnings badge actually lights up for a new Pending earning.
    this.events.emit({ resource: 'earnings', module: 'Earning', action: 'created' });

    return created;
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
