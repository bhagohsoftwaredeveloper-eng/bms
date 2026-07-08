import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { EarningStatus, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CreateEarningDto } from './create-earning.dto';
import { EarningsService } from './earnings.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateEarningDto) {
    return this.earningsService.create(dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('mine') mine?: string) {
    const isAdminLike = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN_STAFF;
    const userId = isAdminLike && mine !== 'true' ? undefined : user.id;
    return this.earningsService.findAll(userId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.earningsService.setStatus(id, EarningStatus.APPROVED, user.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch(':id/paid')
  markPaid(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.earningsService.setStatus(id, EarningStatus.PAID, user.id);
  }
}
