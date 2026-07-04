import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Request,
  Patch,
  BadRequestException,
} from '@nestjs/common';
import { MachinesService } from './machines.service';
import { CreateMachineDto } from './create-machine.dto';
import { RecordInkUsageDto, ResetInkUsageDto } from './ink-tracking.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

@Controller('machines')
@UseGuards(JwtAuthGuard)
export class MachinesController {
  constructor(private machinesService: MachinesService) {}

  /**
   * Create a new printer machine (Admin only)
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  async createMachine(@Body() dto: CreateMachineDto) {
    return this.machinesService.createMachine(dto);
  }

  /**
   * Get all machines (Machine Operator and Admin)
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles('MACHINE_OPERATOR', 'SUPER_ADMIN', 'ADMIN_STAFF')
  async getAllMachines() {
    return this.machinesService.getAllMachines();
  }

  /**
   * Get machine details with ink status
   */
  @Get(':machineId')
  @UseGuards(RolesGuard)
  @Roles('MACHINE_OPERATOR', 'SUPER_ADMIN', 'ADMIN_STAFF')
  async getMachineById(@Param('machineId') machineId: string) {
    const machine = await this.machinesService.getMachineById(machineId);
    if (!machine) {
      throw new BadRequestException('Machine not found');
    }
    return machine;
  }

  /**
   * Record ink usage (Machine Operator)
   */
  @Post(':machineId/inks/:machineInkId/usage')
  @UseGuards(RolesGuard)
  @Roles('MACHINE_OPERATOR')
  async recordInkUsage(
    @Param('machineId') machineId: string,
    @Param('machineInkId') machineInkId: string,
    @Body() dto: RecordInkUsageDto,
    @Request() req: any,
  ) {
    return this.machinesService.recordInkUsage(
      machineId,
      machineInkId,
      dto,
      req.user.id,
    );
  }

  /**
   * Get ink usage history
   */
  @Get(':machineId/inks/:machineInkId/usage-history')
  @UseGuards(RolesGuard)
  @Roles('MACHINE_OPERATOR', 'SUPER_ADMIN', 'ADMIN_STAFF')
  async getInkUsageHistory(
    @Param('machineInkId') machineInkId: string,
  ) {
    return this.machinesService.getInkUsageHistory(machineInkId);
  }

  /**
   * Get ink refill history
   */
  @Get(':machineId/inks/:machineInkId/refill-history')
  @UseGuards(RolesGuard)
  @Roles('MACHINE_OPERATOR', 'SUPER_ADMIN', 'ADMIN_STAFF')
  async getInkRefillHistory(
    @Param('machineInkId') machineInkId: string,
  ) {
    return this.machinesService.getInkRefillHistory(machineInkId);
  }

  /**
   * Reset ink usage after refill (Admin only)
   */
  @Patch(':machineId/inks/:machineInkId/reset')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  async resetInkUsage(
    @Param('machineId') machineId: string,
    @Param('machineInkId') machineInkId: string,
    @Body() dto: ResetInkUsageDto,
    @Request() req: any,
  ) {
    return this.machinesService.resetInkUsage(
      machineInkId,
      dto,
      req.user.id,
    );
  }

  /**
   * Get dashboard summary (Admin)
   */
  @Get('dashboard/summary')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  async getDashboardSummary() {
    return this.machinesService.getDashboardSummary();
  }
}
