import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { UpsertJobOrderDto } from './upsert-job-order.dto';
import { JobOrdersService } from './job-orders.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('job-orders')
export class JobOrdersController {
  constructor(private readonly jobOrdersService: JobOrdersService) {}

  /** Create or update the job order (upsert by jobId) */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF)
  @Post()
  upsert(@Body() dto: UpsertJobOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.jobOrdersService.upsert(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF)
  @Get()
  findAll() {
    return this.jobOrdersService.findAll();
  }

  /** Get the job order for a specific job — returns null if not yet created */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.DESIGNER)
  @Get('by-job/:jobId')
  findByJob(@Param('jobId') jobId: string) {
    return this.jobOrdersService.findByJob(jobId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.DESIGNER)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobOrdersService.findOne(id);
  }

}
