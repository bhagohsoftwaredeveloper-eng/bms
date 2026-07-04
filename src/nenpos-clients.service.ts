import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { read, utils } from 'xlsx';
import { PrismaService } from './prisma.service';
import { CreateNenposClientDto } from './create-nenpos-client.dto';
import { UpdateNenposClientDto } from './update-nenpos-client.dto';

interface ExcelRow {
  'Client ID'?: unknown;
  'Client Name'?: unknown;
  'Start Date'?: unknown;
  'Expiry Date'?: unknown;
  'License'?: unknown;
  'Status'?: unknown;
  'Installer'?: unknown;
  'Notes'?: unknown;
  'Address'?: unknown;
  [key: string]: unknown;
}

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // Excel serial date
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value.trim());
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim() || null;
}

function generateClientId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'NPC-';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

@Injectable()
export class NenposClientsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.nenposClient.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: CreateNenposClientDto) {
    const clientName = dto.clientName?.trim();
    if (!clientName) throw new BadRequestException('Client Name is required.');

    return this.prisma.nenposClient.create({
      data: {
        clientId: dto.clientId?.trim() || generateClientId(),
        clientName,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        license: dto.license?.trim() || null,
        status: dto.status?.trim() || 'ACTIVE',
        installer: dto.installer?.trim() || null,
        notes: dto.notes?.trim() || null,
        address: dto.address?.trim() || null,
      },
    });
  }

  async uploadExcel(buffer: Buffer) {
    const workbook = read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new BadRequestException('Excel file has no sheets.');

    const rows: ExcelRow[] = utils.sheet_to_json(sheet, { defval: '' });
    if (rows.length === 0) throw new BadRequestException('No data rows found in the Excel file.');

    const records = rows.map((row) => {
      const clientId = str(row['Client ID']);
      const clientName = str(row['Client Name']);
      if (!clientName) throw new BadRequestException('Each row must have a Client Name.');

      return {
        clientId: clientId || generateClientId(),
        clientName,
        startDate: parseExcelDate(row['Start Date']),
        expiryDate: parseExcelDate(row['Expiry Date']),
        license: str(row['License']),
        status: str(row['Status']) ?? 'ACTIVE',
        installer: str(row['Installer']),
        notes: str(row['Notes']),
        address: str(row['Address']),
      };
    });

    await this.prisma.nenposClient.createMany({ data: records });
    return { imported: records.length };
  }

  async update(id: string, dto: UpdateNenposClientDto) {
    const existing = await this.prisma.nenposClient.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`NENPOS client ${id} not found`);

    const data: Prisma.NenposClientUpdateInput = {};
    if (dto.clientName !== undefined) {
      const name = dto.clientName.trim();
      if (!name) throw new BadRequestException('Client Name cannot be empty.');
      data.clientName = name;
    }
    if (dto.clientId !== undefined) data.clientId = dto.clientId.trim() || existing.clientId;
    if (dto.license !== undefined) data.license = dto.license.trim() || null;
    if (dto.status !== undefined) data.status = dto.status.trim() || 'ACTIVE';
    if (dto.installer !== undefined) data.installer = dto.installer.trim() || null;
    if (dto.address !== undefined) data.address = dto.address.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.expiryDate !== undefined) data.expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : null;

    return this.prisma.nenposClient.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.nenposClient.delete({ where: { id } });
  }

  deleteAll() {
    return this.prisma.nenposClient.deleteMany();
  }
}
