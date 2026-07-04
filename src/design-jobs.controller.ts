import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AddDesignJobUpdateDto } from './add-design-job-update.dto';
import { AssignDesignJobDto } from './assign-design-job.dto';
import { CreateDesignJobDto } from './create-design-job.dto';
import { DesignJobsService } from './design-jobs.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('design-jobs')
export class DesignJobsController {
  constructor(private readonly designJobsService: DesignJobsService) {}

  @Roles(UserRole.DESIGNER, UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateDesignJobDto, @CurrentUser() user: AuthenticatedUser) {
    return this.designJobsService.create(dto, user.id);
  }

  @Roles(UserRole.DESIGNER, UserRole.SUPER_ADMIN)
  @Get('operators')
  listOperators() {
    return this.designJobsService.listOperators();
  }

  @Roles(UserRole.DESIGNER, UserRole.MACHINE_OPERATOR, UserRole.ADMIN_STAFF, UserRole.SUPER_ADMIN)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.designJobsService.findAll(user.id, user.role);
  }

  @Roles(UserRole.DESIGNER, UserRole.MACHINE_OPERATOR, UserRole.ADMIN_STAFF, UserRole.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.designJobsService.findOne(id, user.id, user.role);
  }

  @Roles(UserRole.DESIGNER, UserRole.SUPER_ADMIN)
  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignDesignJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.designJobsService.assign(id, dto, user);
  }

  @Roles(UserRole.DESIGNER, UserRole.MACHINE_OPERATOR, UserRole.ADMIN_STAFF, UserRole.SUPER_ADMIN)
  @Post(':id/updates')
  addUpdate(
    @Param('id') id: string,
    @Body() dto: AddDesignJobUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.designJobsService.addUpdate(id, dto, user);
  }
}
