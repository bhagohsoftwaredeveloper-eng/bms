import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JobOrderType, UserRole } from '@prisma/client';
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

  /** Create or update the job order (upsert by jobId or designJobId) */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF)
  @Post()
  upsert(@Body() dto: UpsertJobOrderDto) {
    return this.jobOrdersService.upsert(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.DESIGNER, UserRole.MACHINE_OPERATOR)
  @Get()
  findAll(@Query('type') type: JobOrderType | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.jobOrdersService.findAll(type, user);
  }

  /** Get the job order for a specific job — returns null if not yet created */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.DESIGNER, UserRole.MACHINE_OPERATOR)
  @Get('by-job/:jobId')
  findByJob(@Param('jobId') jobId: string) {
    return this.jobOrdersService.findByJob(jobId);
  }

  /** Get the job order for a specific design job — returns null if not yet created */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.DESIGNER, UserRole.MACHINE_OPERATOR)
  @Get('by-design-job/:designJobId')
  findByDesignJob(@Param('designJobId') designJobId: string) {
    return this.jobOrdersService.findByDesignJob(designJobId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.DESIGNER, UserRole.MACHINE_OPERATOR)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobOrdersService.findOne(id);
  }

}
