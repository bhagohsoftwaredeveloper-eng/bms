import { BadRequestException } from '@nestjs/common';
import { MODULE_TABLES, resolveModuleTables } from './restore.service';

describe('MODULE_TABLES', () => {
  it('covers exactly the Reset module ids', () => {
    expect(Object.keys(MODULE_TABLES).sort()).toEqual(
      [
        'audit-logs',
        'dev-projects',
        'earnings',
        'job-orders',
        'jobs',
        'kpi',
        'licenses',
        'nenpos-clients',
        'notifications',
        'withdrawals',
      ].sort(),
    );
  });

  it('maps jobs to its two tables', () => {
    expect(MODULE_TABLES['jobs']).toEqual(['jobs', 'installation_proofs']);
  });
});

describe('resolveModuleTables', () => {
  it('dedupes and flattens selected modules', () => {
    expect(resolveModuleTables(['jobs', 'earnings']).sort()).toEqual(
      ['earnings', 'installation_proofs', 'jobs'].sort(),
    );
  });

  it('rejects an unknown module id', () => {
    expect(() => resolveModuleTables(['bogus'])).toThrow(BadRequestException);
  });

  it('rejects an empty selection', () => {
    expect(() => resolveModuleTables([])).toThrow(BadRequestException);
  });
});
