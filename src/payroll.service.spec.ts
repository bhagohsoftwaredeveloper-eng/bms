import { BadRequestException } from '@nestjs/common';
import { PayrollService, nameTokensMatch } from './payroll.service';

const apiEmployees = [
  { id: 4, user_id: 9, name: 'Dela Cruz, Juan', employee_number: 'EMP-0004', department: 'Operations', daily_rate: 650, is_active: true },
  { id: 5, user_id: null, name: 'Santos, Ana', employee_number: null, department: null, daily_rate: 0, is_active: false },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('PayrollService', () => {
  const realFetch = global.fetch;
  const saved = { base: process.env.PAYROLL_API_BASE_URL, token: process.env.PAYROLL_API_TOKEN };

  beforeEach(() => {
    process.env.PAYROLL_API_BASE_URL = 'https://payroll.example.com/api/';
    process.env.PAYROLL_API_TOKEN = 'secret-token';
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  afterAll(() => {
    if (saved.base === undefined) delete process.env.PAYROLL_API_BASE_URL; else process.env.PAYROLL_API_BASE_URL = saved.base;
    if (saved.token === undefined) delete process.env.PAYROLL_API_TOKEN; else process.env.PAYROLL_API_TOKEN = saved.token;
  });

  describe('listEmployees', () => {
    it('throws when the payroll API is not configured', async () => {
      delete process.env.PAYROLL_API_TOKEN;
      await expect(new PayrollService({} as never).listEmployees()).rejects.toThrow(
        'PAYROLL_API_BASE_URL and PAYROLL_API_TOKEN must be configured on the server.',
      );
    });

    it('calls /employees with the bearer token and maps the fields', async () => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ data: apiEmployees }));
      global.fetch = fetchMock as never;

      const result = await new PayrollService({} as never).listEmployees();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe('https://payroll.example.com/api/employees');
      expect(init.headers).toEqual({ Authorization: 'Bearer secret-token', Accept: 'application/json' });
      expect(result[0]).toEqual({
        id: 4,
        name: 'Dela Cruz, Juan',
        employeeNumber: 'EMP-0004',
        department: 'Operations',
        dailyRate: 650,
        isActive: true,
      });
    });

    it('turns auth failures into a readable error', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, 401)) as never;
      await expect(new PayrollService({} as never).listEmployees()).rejects.toThrow(BadRequestException);
      await expect(new PayrollService({} as never).listEmployees()).rejects.toThrow(/rejected the token/);
    });

    it('turns network failures into a readable error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never;
      await expect(new PayrollService({} as never).listEmployees()).rejects.toThrow('Could not reach the payroll API.');
    });
  });

  describe('syncLinkedBaseBonuses', () => {
    function makePrisma(linked: Array<{ id: string; payrollEmployeeId: number; baseBonus: number }>) {
      return {
        user: {
          findMany: jest.fn().mockResolvedValue(linked),
          update: jest.fn().mockResolvedValue({}),
        },
      };
    }

    it("sets each linked user's base bonus to their payroll daily rate", async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: apiEmployees })) as never;
      const prisma = makePrisma([{ id: 'u1', payrollEmployeeId: 4, baseBonus: 10000 }]);

      const result = await new PayrollService(prisma as never).syncLinkedBaseBonuses();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { payrollEmployeeId: { not: null } },
        select: { id: true, payrollEmployeeId: true, baseBonus: true },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { baseBonus: 650 } });
      expect(result).toEqual({ updated: 1, skipped: 0 });
    });

    it('skips users whose employee is missing or has no rate', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: apiEmployees })) as never;
      const prisma = makePrisma([
        { id: 'u1', payrollEmployeeId: 5, baseBonus: 10000 },
        { id: 'u2', payrollEmployeeId: 99, baseBonus: 10000 },
      ]);

      const result = await new PayrollService(prisma as never).syncLinkedBaseBonuses();

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual({ updated: 0, skipped: 2 });
    });

    it('does not call the API when nobody is linked', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as never;
      const prisma = makePrisma([]);

      const result = await new PayrollService(prisma as never).syncLinkedBaseBonuses();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toEqual({ updated: 0, skipped: 0 });
    });
  });
});


describe('nameTokensMatch', () => {
  it('matches when every word of the payroll name is in the user name, ignoring case and order', () => {
    expect(nameTokensMatch('ARROZ', 'Santino Arroz')).toBe(true);
    expect(nameTokensMatch('MERCADO JOSHUA', 'Erdy Joshua Mercado')).toBe(true);
    expect(nameTokensMatch('Dela Cruz, Juan', 'Juan A. Dela Cruz')).toBe(true);
  });

  it('does not match when a word is missing or the name is empty', () => {
    expect(nameTokensMatch('RODULFA', 'Rex Domingo')).toBe(false);
    expect(nameTokensMatch('MERCADO JOSHUA', 'Erdy Mercado')).toBe(false);
    expect(nameTokensMatch('', 'Rex Domingo')).toBe(false);
  });
});

describe('PayrollService.autoLinkUsers', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env.PAYROLL_API_BASE_URL = 'https://payroll.example.com/api';
    process.env.PAYROLL_API_TOKEN = 't';
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const employees = [
    { id: 10, name: 'ARROZ', employee_number: null, department: null, daily_rate: 550, is_active: true },
    { id: 2, name: 'DOMINGO', employee_number: null, department: null, daily_rate: 975, is_active: true },
    { id: 3, name: 'LUNA', employee_number: null, department: null, daily_rate: 750, is_active: true },
  ];

  function setup(users: Array<{ id: string; fullName: string }>, alreadyLinkedIds: number[] = []) {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: employees }) }) as never;
    const prisma = {
      user: {
        findMany: jest.fn().mockImplementation(async (args: { where: { payrollEmployeeId: unknown } }) =>
          args.where.payrollEmployeeId === null
            ? users
            : alreadyLinkedIds.map((id) => ({ payrollEmployeeId: id })),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return { prisma, service: new PayrollService(prisma as never) };
  }

  it('links unlinked users to the single employee whose name matches', async () => {
    const { prisma, service } = setup([
      { id: 'u1', fullName: 'Santino Arroz' },
      { id: 'u2', fullName: 'Rex Domingo' },
      { id: 'u3', fullName: 'Ronald Rodulfa' },
    ]);

    const result = await service.autoLinkUsers();

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { payrollEmployeeId: 10 } });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u2' }, data: { payrollEmployeeId: 2 } });
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ linked: 2, unmatched: ['Ronald Rodulfa'] });
  });

  it('skips ambiguous matches where two users share the same payroll employee', async () => {
    const { prisma, service } = setup([
      { id: 'u1', fullName: 'Jim Luna' },
      { id: 'u2', fullName: 'Ana Luna' },
    ]);

    const result = await service.autoLinkUsers();

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result.linked).toBe(0);
    expect(result.unmatched).toEqual(['Jim Luna', 'Ana Luna']);
  });

  it('does not reuse an employee already linked to another user', async () => {
    const { prisma, service } = setup([{ id: 'u1', fullName: 'Santino Arroz' }], [10]);

    const result = await service.autoLinkUsers();

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result.linked).toBe(0);
  });
});
