import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocType, JobOrderStatus, JobOrderType } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { PrismaService } from './prisma.service';
import { InventoryService } from './inventory.service';
import { ConvertJobOrderDto, UpsertJobOrderDto } from './upsert-job-order.dto';
import { ensureLaborEarning } from './job-order-labor.util';
import { computeUnitTotals, validateUnits } from './job-order-units.util';

const INCLUDE_FULL = {
  client: true,
  product: true,
  job: { include: { installer: true } },
  items: { orderBy: { createdAt: 'asc' as const } },
  units: { orderBy: { sortOrder: 'asc' as const } },
};

// Split from INCLUDE_FULL because findAll() shares that shape for the job
// order list: embedding the full agreement text there would put several
// kilobytes of legal prose on every row of a response that never displays it.
const INCLUDE_WITH_AGREEMENT = {
  ...INCLUDE_FULL,
  agreementVersion: { include: { sections: { orderBy: { sortOrder: 'asc' as const } } } },
};

@Injectable()
export class JobOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async upsert(dto: UpsertJobOrderDto, user: AuthenticatedUser) {
    const existing = dto.id
      ? await this.prisma.jobOrder.findUnique({ where: { id: dto.id } })
      : dto.jobId
        ? await this.prisma.jobOrder.findUnique({ where: { jobId: dto.jobId } })
        : null;
    if (dto.id && !existing) {
      throw new NotFoundException(`Job order ${dto.id} not found`);
    }

    const type = dto.type ?? JobOrderType.SOFTWARE;
    const units = type === JobOrderType.SOFTWARE ? (dto.units ?? []) : [];
    if (units.length) {
      validateUnits(units, dto.items.map((i) => i.unitKey));
    }
    const unitTotals = units.length ? computeUnitTotals(units) : null;

    const data = {
      clientId: dto.clientId,
      productId: unitTotals ? (units[0].productId ?? null) : (dto.productId ?? null),
      salePrice: unitTotals ? unitTotals.salePrice : dto.salePrice,
      cloudTotal: unitTotals ? unitTotals.cloudTotal : 0,
      discount: dto.discount ?? 0,
      discountType: dto.discountType ?? 'FIXED',
      remarks: dto.remarks ?? null,
      status: dto.status ?? JobOrderStatus.DRAFT,
      type,
      cameraCount: dto.cameraCount ?? null,
      cameraRate: dto.cameraRate ?? null,
      laborPct: dto.laborPct ?? null,
      docType: dto.docType ?? DocType.JOB_ORDER,
      includeAgreement: dto.includeAgreement ?? false,
      includesBackofficeExtension: dto.includesBackofficeExtension ?? false,
    };
    const newCompleted = data.status === JobOrderStatus.COMPLETED;

    const toItemRow = (item: (typeof dto.items)[number]) => ({
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      inventoryItemId: item.inventoryItemId ?? null,
      warrantyTier: item.warrantyTier ?? 'ACCESSORY',
    });
    // General items (and every item on a legacy/no-units order) are created
    // nested with the order; computer-tagged items need the new unit ids first.
    const itemsCreate = dto.items.filter((i) => !units.length || !i.unitKey).map(toItemRow);
    const unitItems = units.length ? dto.items.filter((i) => i.unitKey) : [];

    return this.prisma.$transaction(async (tx) => {
      let oldItems: { inventoryItemId: string | null; quantity: number }[] = [];
      let oldCompleted = false;
      let jobOrder;

      if (existing) {
        oldItems = await tx.jobOrderItem.findMany({
          where: { jobOrderId: existing.id },
          select: { inventoryItemId: true, quantity: true },
        });
        oldCompleted = existing.status === JobOrderStatus.COMPLETED;

        await tx.jobOrderItem.deleteMany({ where: { jobOrderId: existing.id } });
        await tx.jobOrderUnit.deleteMany({ where: { jobOrderId: existing.id } });
        jobOrder = await tx.jobOrder.update({
          where: { id: existing.id },
          data: { ...data, items: { createMany: { data: itemsCreate } } },
          include: INCLUDE_FULL,
        });
      } else {
        jobOrder = await tx.jobOrder.create({
          data: {
            jobId: dto.jobId,
            ...data,
            items: { createMany: { data: itemsCreate } },
          },
          include: INCLUDE_FULL,
        });
      }

      if (units.length) {
        const keyToId = new Map<string, string>();
        for (const [index, u] of units.entries()) {
          const created = await tx.jobOrderUnit.create({
            data: {
              jobOrderId: jobOrder.id,
              label: u.label,
              sortOrder: index,
              productId: u.productId ?? null,
              price: u.price,
              cloudEnabled: u.cloudEnabled ?? false,
              cloudMonthlyRate: u.cloudEnabled ? (u.cloudMonthlyRate ?? 0) : null,
              cloudMonths: u.cloudEnabled ? (u.cloudMonths ?? 1) : null,
            },
          });
          keyToId.set(u.key, created.id);
        }
        if (unitItems.length) {
          await tx.jobOrderItem.createMany({
            data: unitItems.map((i) => ({
              jobOrderId: jobOrder.id,
              ...toItemRow(i),
              unitId: keyToId.get(i.unitKey!)!,
            })),
          });
        }
        jobOrder = await tx.jobOrder.findUniqueOrThrow({ where: { id: jobOrder.id }, include: INCLUDE_FULL });
      }

      // Reconcile inventory stock for the completed-state change.
      await this.inventory.applyJobOrderStock(
        tx,
        jobOrder.id,
        oldItems,
        oldCompleted,
        dto.items,
        newCompleted,
        user.id,
      );

      // CCTV/Signage: guarantee the installer's labor earning once finalized.
      await ensureLaborEarning(tx, jobOrder);

      return jobOrder;
    });
  }

  async findByJob(jobId: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { jobId },
      include: INCLUDE_WITH_AGREEMENT,
    });
    return jobOrder;
  }

  async findOne(id: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { id },
      include: INCLUDE_WITH_AGREEMENT,
    });
    if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);
    return jobOrder;
  }

  findAll() {
    return this.prisma.jobOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: INCLUDE_FULL,
    });
  }

  /** Standalone quotation → job order: creates the installation job and links it. */
  async convert(id: string, dto: ConvertJobOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const jobOrder = await tx.jobOrder.findUnique({ where: { id } });
      if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);
      if (jobOrder.jobId) {
        throw new BadRequestException('This order is already linked to an installation job.');
      }

      const job = await tx.job.create({
        data: {
          clientId: jobOrder.clientId,
          scheduleDate: new Date(dto.scheduleDate),
          installerId: dto.installerId ?? null,
        },
      });

      // Keep the JobInstaller roster in sync with the primary installer —
      // without it the job is invisible to its installer in GET /jobs and the
      // admin edit form opens with nothing checked (silently unassigning).
      if (dto.installerId) {
        await tx.jobInstaller.create({ data: { jobId: job.id, userId: dto.installerId } });
      }

      return tx.jobOrder.update({
        where: { id },
        data: { jobId: job.id, docType: DocType.JOB_ORDER },
        include: INCLUDE_FULL,
      });
    });
  }

  /**
   * Locks the order to the current template so a reprint reproduces the signed
   * text. Idempotent — the print handler calls it on every print.
   */
  async pinAgreement(id: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { id },
      select: { id: true, agreementVersionId: true },
    });
    if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);
    if (jobOrder.agreementVersionId) return { agreementVersionId: jobOrder.agreementVersionId };

    const latest = await this.prisma.agreementVersion.findFirst({
      orderBy: { versionNo: 'desc' },
      select: { id: true },
    });
    if (!latest) return { agreementVersionId: null };

    await this.prisma.jobOrder.update({
      where: { id },
      data: { agreementVersionId: latest.id },
    });
    return { agreementVersionId: latest.id };
  }

  /** Releases the lock so the order follows the latest template again. */
  async unpinAgreement(id: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({ where: { id }, select: { id: true } });
    if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);

    await this.prisma.jobOrder.update({ where: { id }, data: { agreementVersionId: null } });
    return { agreementVersionId: null };
  }
}
