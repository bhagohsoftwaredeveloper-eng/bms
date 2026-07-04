import { Injectable } from '@nestjs/common';
import { PrinterMachine, MachineInk, InkUsageLog, InkRefillLog } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CreateMachineDto } from './create-machine.dto';
import { RecordInkUsageDto, ResetInkUsageDto } from './ink-tracking.dto';

@Injectable()
export class MachinesService {
  constructor(private prisma: PrismaService) {}

  // Predefined ink configurations per machine model
  private machineInkConfigs = {
    TS100_1600_SUBLIMATION: [
      { color: 'BLACK', capacity: 1000 },
      { color: 'CYAN', capacity: 1000 },
      { color: 'MAGENTA', capacity: 1000 },
      { color: 'YELLOW', capacity: 1000 },
    ],
    JV100_160: [
      { color: 'BLACK', capacity: 2000 }, // 2 bottles
      { color: 'CYAN', capacity: 2000 },
      { color: 'MAGENTA', capacity: 2000 },
      { color: 'YELLOW', capacity: 2000 },
    ],
    UCJV300_160: [
      { color: 'BLACK', capacity: 1000 },
      { color: 'CYAN', capacity: 1000 },
      { color: 'MAGENTA', capacity: 1000 },
      { color: 'YELLOW', capacity: 1000 },
      { color: 'CLEAR', capacity: 2000 }, // 2 bottles
      { color: 'WHITE', capacity: 2000 }, // 2 bottles
    ],
  };

  /**
   * Create a new printer machine
   */
  async createMachine(dto: CreateMachineDto): Promise<PrinterMachine> {
    const machine = await this.prisma.printerMachine.create({
      data: {
        model: dto.model as any,
        label: dto.label,
      },
    });

    // Initialize inks for this machine based on model
    const inkConfig = this.machineInkConfigs[dto.model];
    if (inkConfig) {
      await this.prisma.machineInk.createMany({
        data: inkConfig.map((ink) => ({
          machineId: machine.id,
          inkColor: ink.color as any,
          maxCapacity: ink.capacity,
          currentUsage: 0,
        })),
      });
    }

    return machine;
  }

  /**
   * Get all machines with their current ink status
   */
  async getAllMachines() {
    return this.prisma.printerMachine.findMany({
      include: {
        machineInks: {
          orderBy: { inkColor: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single machine with detailed ink info
   */
  async getMachineById(machineId: string) {
    return this.prisma.printerMachine.findUnique({
      where: { id: machineId },
      include: {
        machineInks: {
          orderBy: { inkColor: 'asc' },
        },
        inkLogs: {
          take: -20, // Last 20 logs
          orderBy: { recordedAt: 'desc' },
        },
      },
    });
  }

  /**
   * Record ink usage (called by Machine Operator)
   */
  async recordInkUsage(
    machineId: string,
    machineInkId: string,
    dto: RecordInkUsageDto,
    userId?: string,
  ): Promise<InkUsageLog> {
    // Get current ink status
    const machineInk = await this.prisma.machineInk.findUnique({
      where: { id: machineInkId },
    });

    if (!machineInk || machineInk.machineId !== machineId) {
      throw new Error('Invalid machine ink');
    }

    // Update usage (rounded to avoid floating-point drift on small decimal amounts)
    const newUsage = Math.round((machineInk.currentUsage + dto.amountUsed) * 10000) / 10000;

    await this.prisma.machineInk.update({
      where: { id: machineInkId },
      data: {
        currentUsage: newUsage,
      },
    });

    // Log the usage
    return this.prisma.inkUsageLog.create({
      data: {
        machineId,
        machineInkId,
        amountUsed: dto.amountUsed,
        jobReference: dto.jobReference,
        notes: dto.notes,
        recordedBy: userId,
      },
    });
  }

  /**
   * Get ink usage history for a machine ink
   */
  async getInkUsageHistory(machineInkId: string, limit = 50) {
    return this.prisma.inkUsageLog.findMany({
      where: { machineInkId },
      take: -limit,
      orderBy: { recordedAt: 'desc' },
    });
  }

  /**
   * Get ink refill history for a machine ink
   */
  async getInkRefillHistory(machineInkId: string, limit = 50) {
    return this.prisma.inkRefillLog.findMany({
      where: { machineInkId },
      take: -limit,
      orderBy: { refillDate: 'desc' },
    });
  }

  /**
   * Reset ink usage (called by Admin - when refill is done)
   */
  async resetInkUsage(
    machineInkId: string,
    dto: ResetInkUsageDto,
    adminUserId: string,
  ): Promise<MachineInk> {
    const machineInk = await this.prisma.machineInk.findUnique({
      where: { id: machineInkId },
    });

    if (!machineInk) {
      throw new Error('Machine ink not found');
    }

    // Log the refill
    await this.prisma.inkRefillLog.create({
      data: {
        machineId: machineInk.machineId,
        machineInkId,
        previousUsage: machineInk.currentUsage,
        newUsage: dto.newUsage,
        refillBy: adminUserId,
        notes: dto.notes,
      },
    });

    // Reset the usage
    return this.prisma.machineInk.update({
      where: { id: machineInkId },
      data: {
        currentUsage: dto.newUsage,
        lastRefillAt: new Date(),
      },
    });
  }

  /**
   * Get dashboard summary - ink usage across all machines
   */
  async getDashboardSummary() {
    const machines = await this.prisma.printerMachine.findMany({
      include: {
        machineInks: true,
      },
    });

    return machines.map((machine) => ({
      id: machine.id,
      label: machine.label,
      model: machine.model,
      inks: machine.machineInks.map((ink) => ({
        id: ink.id,
        color: ink.inkColor,
        currentUsage: ink.currentUsage,
        maxCapacity: ink.maxCapacity,
        percentageUsed: (ink.currentUsage / ink.maxCapacity) * 100,
        lastRefillAt: ink.lastRefillAt,
      })),
    }));
  }
}
