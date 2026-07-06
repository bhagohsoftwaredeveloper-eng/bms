import { Injectable, NotFoundException } from '@nestjs/common';
import { JobOrderStatus, JobOrderType, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { PrismaService } from './prisma.service';
import { InventoryService } from './inventory.service';
import { UpsertJobOrderDto } from './upsert-job-order.dto';

const INCLUDE_FULL = {
  client: true,
  product: true,
  job: { include: { installer: true } },
  designJob: { include: { designer: true, operator: true } },
  items: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class JobOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async upsert(dto: UpsertJobOrderDto, user: AuthenticatedUser) {
    // Find existing by either jobId or designJobId
    const where: Prisma.JobOrderWhereUniqueInput = dto.jobId
      ? { jobId: dto.jobId }
      : { designJobId: dto.designJobId! };

    const existing = await this.prisma.jobOrder.findUnique({ where });

    const data = {
      type: dto.type ?? (dto.jobId ? JobOrderType.SOFTWARE : JobOrderType.DESIGN),
      clientId: dto.clientId,
      productId: dto.productId ?? null,
      salePrice: dto.salePrice,
      discount: dto.discount ?? 0,
      discountType: dto.discountType ?? 'FIXED',
      remarks: dto.remarks ?? null,
      status: dto.status ?? JobOrderStatus.DRAFT,
    };
    const newCompleted = data.status === JobOrderStatus.COMPLETED;

    const itemsCreate = dto.items.map((item) => ({
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      inventoryItemId: item.inventoryItemId ?? null,
    }));

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
        jobOrder = await tx.jobOrder.update({
          where: { id: existing.id },
          data: { ...data, items: { createMany: { data: itemsCreate } } },
          include: INCLUDE_FULL,
        });
      } else {
        jobOrder = await tx.jobOrder.create({
          data: {
            jobId: dto.jobId,
            designJobId: dto.designJobId,
            ...data,
            items: { createMany: { data: itemsCreate } },
          },
          include: INCLUDE_FULL,
        });
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

      return jobOrder;
    });
  }

  async findByJob(jobId: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { jobId },
      include: INCLUDE_FULL,
    });
    return jobOrder;
  }

  async findByDesignJob(designJobId: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { designJobId },
      include: INCLUDE_FULL,
    });
    return jobOrder;
  }

  async findOne(id: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { id },
      include: INCLUDE_FULL,
    });
    if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);
    return jobOrder;
  }

  findAll(type: JobOrderType | undefined, user: AuthenticatedUser) {
    const where: Prisma.JobOrderWhereInput = type ? { type } : {};

    if (user.role === UserRole.DESIGNER) {
      where.designJob = { designerId: user.id };
    } else if (user.role === UserRole.MACHINE_OPERATOR) {
      where.designJob = { operatorId: user.id };
    }

    return this.prisma.jobOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: INCLUDE_FULL,
    });
  }
}
