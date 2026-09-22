import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface PayrollEmployee {
  id: number;
  name: string;
  employeeNumber: string | null;
  department: string | null;
  dailyRate: number;
  isActive: boolean;
}

interface PayrollApiEmployee {
  id: number;
  name: string;
  employee_number: string | null;
  department: string | null;
  daily_rate: number | string;
  is_active: boolean;
}

function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/** True when every word of the payroll name appears in the user's full name (payroll often stores surnames only). */
export function nameTokensMatch(payrollName: string, userFullName: string): boolean {
  const wanted = nameTokens(payrollName);
  if (wanted.length === 0) return false;
  const have = new Set(nameTokens(userFullName));
  return wanted.every((token) => have.has(token));
}

/** Read-only client for the external payroll app's Employee Info API (Laravel Sanctum bearer token). */
@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async listEmployees(): Promise<PayrollEmployee[]> {
    const base = process.env.PAYROLL_API_BASE_URL;
    const token = process.env.PAYROLL_API_TOKEN;
    if (!base || !token) {
      throw new BadRequestException('PAYROLL_API_BASE_URL and PAYROLL_API_TOKEN must be configured on the server.');
    }

    const res = await fetch(`${base.replace(/\/+$/, '')}/employees`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }).catch(() => {
      throw new BadRequestException('Could not reach the payroll API.');
    });
    if (res.status === 401 || res.status === 403) {
      throw new BadRequestException(`The payroll API rejected the token (HTTP ${res.status}).`);
    }
    if (!res.ok) throw new BadRequestException(`The payroll API returned HTTP ${res.status}.`);

    const body = (await res.json()) as { data?: PayrollApiEmployee[] };
    return (body.data ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      employeeNumber: e.employee_number,
      department: e.department,
      dailyRate: Number(e.daily_rate) || 0,
      isActive: e.is_active,
    }));
  }

  async getEmployee(id: number): Promise<PayrollEmployee | undefined> {
    return (await this.listEmployees()).find((e) => e.id === id);
  }

  /**
   * Links still-unlinked active users to the one payroll employee whose name matches.
   * Ambiguous matches (several users for one employee, or the reverse) and employees
   * already linked elsewhere are left for manual linking.
   */
  async autoLinkUsers(): Promise<{ linked: number; unmatched: string[] }> {
    const [users, alreadyLinked] = await Promise.all([
      this.prisma.user.findMany({ where: { payrollEmployeeId: null, isActive: true }, select: { id: true, fullName: true } }),
      this.prisma.user.findMany({ where: { payrollEmployeeId: { not: null } }, select: { payrollEmployeeId: true } }),
    ]);
    if (users.length === 0) return { linked: 0, unmatched: [] };

    const taken = new Set(alreadyLinked.map((u) => u.payrollEmployeeId));
    const employees = (await this.listEmployees()).filter((e) => !taken.has(e.id));

    const candidates = users.map((user) => ({
      user,
      matches: employees.filter((e) => nameTokensMatch(e.name, user.fullName)),
    }));
    const usersPerEmployee = new Map<number, number>();
    for (const { matches } of candidates) {
      for (const e of matches) usersPerEmployee.set(e.id, (usersPerEmployee.get(e.id) ?? 0) + 1);
    }

    let linked = 0;
    const unmatched: string[] = [];
    for (const { user, matches } of candidates) {
      if (matches.length === 1 && usersPerEmployee.get(matches[0].id) === 1) {
        await this.prisma.user.update({ where: { id: user.id }, data: { payrollEmployeeId: matches[0].id } });
        linked += 1;
      } else {
        unmatched.push(user.fullName);
      }
    }
    return { linked, unmatched };
  }

  /** Copies each linked user's payroll daily rate into their base bonus. */
  async syncLinkedBaseBonuses(): Promise<{ updated: number; skipped: number }> {
    const linked = await this.prisma.user.findMany({
      where: { payrollEmployeeId: { not: null } },
      select: { id: true, payrollEmployeeId: true, baseBonus: true },
    });
    if (linked.length === 0) return { updated: 0, skipped: 0 };

    const employees = new Map((await this.listEmployees()).map((e) => [e.id, e]));
    let updated = 0;
    let skipped = 0;
    for (const user of linked) {
      const employee = employees.get(user.payrollEmployeeId as number);
      if (!employee || employee.dailyRate <= 0) {
        skipped += 1;
        continue;
      }
      await this.prisma.user.update({ where: { id: user.id }, data: { baseBonus: employee.dailyRate } });
      updated += 1;
    }
    return { updated, skipped };
  }
}
