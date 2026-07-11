import { BadRequestException } from '@nestjs/common';

/** Module id → the real MySQL tables it owns. Mirrors ResetService's modules. */
export const MODULE_TABLES: Record<string, string[]> = {
  jobs: ['jobs', 'installation_proofs'],
  'job-orders': ['job_orders', 'job_order_items'],
  'dev-projects': [
    'dev_projects',
    'dev_project_sessions',
    'dev_project_reports',
    'dev_project_report_feedback',
  ],
  licenses: ['licenses'],
  earnings: ['earnings'],
  withdrawals: ['withdrawals'],
  kpi: ['kpi_results', 'incentives'],
  notifications: ['notifications'],
  'nenpos-clients': ['nenpos_clients'],
  'audit-logs': ['audit_logs'],
};

/** Resolve module ids to a deduped list of table names. Throws on unknown/empty input. */
export function resolveModuleTables(moduleIds: string[]): string[] {
  if (moduleIds.length === 0) {
    throw new BadRequestException('Select at least one module to restore.');
  }
  const tables = new Set<string>();
  for (const id of moduleIds) {
    const t = MODULE_TABLES[id];
    if (!t) throw new BadRequestException(`Unknown module: ${id}`);
    for (const name of t) tables.add(name);
  }
  return [...tables];
}

export interface RestoreResult {
  scope: 'full' | 'modules';
  tables: string[];
}
