import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { computeBalance, computeGrandTotal } from './job-order-pricing.util';
import { toCsv } from './csv.util';

export interface CollectionsSummary {
  from: string | null;
  to: string | null;
  totalCollected: number;
  byMethod: { method: PaymentMethod; total: number; count: number }[];
  /** Collections per calendar month, last 6 months incl. current, oldest first. */
  byMonth: { month: string; total: number }[];
  /** 10 newest non-voided payments within the from/to filter. */
  recentPayments: {
    id: string;
    jobOrderId: string;
    amount: number;
    method: PaymentMethod;
    paidAt: string;
    clientName: string;
  }[];
}

export interface OutstandingRow {
  jobOrderId: string;
  clientId: string;
  clientName: string;
  grandTotal: number;
  totalPaid: number;
  balance: number;
  lastPaymentAt: string | null;
}

@Injectable()
export class FinancialReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async collectionsSummary(from?: string, to?: string): Promise<CollectionsSummary> {
    const now = new Date();
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const [payments, trendPayments] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          voidedAt: null,
          ...(from || to
            ? {
                paidAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to + 'T23:59:59.999Z') } : {}),
                },
              }
            : {}),
        },
        orderBy: { paidAt: 'desc' },
        include: { jobOrder: { include: { client: true } } },
      }),
      this.prisma.payment.findMany({
        where: { voidedAt: null, paidAt: { gte: trendStart } },
        select: { paidAt: true, amount: true },
      }),
    ]);

    const byMethodMap = new Map<PaymentMethod, { total: number; count: number }>();
    let totalCollected = 0;
    for (const p of payments) {
      const amount = Number(p.amount);
      totalCollected += amount;
      const entry = byMethodMap.get(p.method) ?? { total: 0, count: 0 };
      entry.total += amount;
      entry.count += 1;
      byMethodMap.set(p.method, entry);
    }

    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const byMonth = Array.from({ length: 6 }, (_, i) => ({
      month: monthKey(new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)),
      total: 0,
    }));
    const monthIndex = new Map(byMonth.map((m, i) => [m.month, i]));
    for (const p of trendPayments) {
      const idx = monthIndex.get(monthKey(p.paidAt));
      if (idx !== undefined) byMonth[idx].total += Number(p.amount);
    }

    return {
      from: from ?? null,
      to: to ?? null,
      totalCollected,
      byMethod: [...byMethodMap.entries()].map(([method, v]) => ({ method, ...v })),
      byMonth,
      recentPayments: payments.slice(0, 10).map((p) => ({
        id: p.id,
        jobOrderId: p.jobOrderId,
        amount: Number(p.amount),
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        clientName: p.jobOrder.client.businessName,
      })),
    };
  }

  async outstandingBalances(): Promise<OutstandingRow[]> {
    const jobOrders = await this.prisma.jobOrder.findMany({
      where: { status: { not: 'CANCELLED' } },
      include: { items: true, payments: { where: { voidedAt: null } }, client: true },
    });

    const rows: OutstandingRow[] = [];
    for (const jo of jobOrders) {
      const grandTotal = computeGrandTotal(
        Number(jo.salePrice),
        Number(jo.discount),
        jo.discountType,
        jo.items.map((item) => ({ quantity: item.quantity, unitPrice: Number(item.unitPrice) })),
      );
      const paymentsForBalance = jo.payments.map((p) => ({ amount: Number(p.amount), voidedAt: p.voidedAt }));
      const balance = computeBalance(grandTotal, paymentsForBalance);
      if (balance <= 0.005) continue;

      const lastPayment = [...jo.payments].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0];
      rows.push({
        jobOrderId: jo.id,
        clientId: jo.clientId,
        clientName: jo.client.businessName,
        grandTotal,
        totalPaid: grandTotal - balance,
        balance,
        lastPaymentAt: lastPayment ? lastPayment.paidAt.toISOString() : null,
      });
    }
    return rows;
  }

  async clientHistory(clientId: string) {
    const [client, jobOrders] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: clientId } }),
      this.prisma.jobOrder.findMany({
        where: { clientId },
        include: { payments: { where: { voidedAt: null } } },
      }),
    ]);

    const payments = jobOrders
      .flatMap((jo) => jo.payments.map((p) => ({ ...p, jobOrderId: jo.id })))
      .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

    return { clientId, clientName: client?.businessName ?? 'Unknown', payments };
  }

  async collectionsCsv(from?: string, to?: string): Promise<string> {
    const summary = await this.collectionsSummary(from, to);
    return toCsv(summary.byMethod.map((m) => ({ method: m.method, total: m.total, count: m.count })));
  }

  async outstandingCsv(): Promise<string> {
    const rows = await this.outstandingBalances();
    return toCsv(
      rows.map((r) => ({
        jobOrderId: r.jobOrderId,
        client: r.clientName,
        grandTotal: r.grandTotal,
        totalPaid: r.totalPaid,
        balance: r.balance,
        lastPaymentAt: r.lastPaymentAt ?? '',
      })),
    );
  }
}
