import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedUser } from './authenticated-user.type';
import { ActivateLicenseDto } from './activate-license.dto';
import { GenerateLicenseDto } from './generate-license.dto';
import { UpdateLicenseDto } from './update-license.dto';
import { VoidTransferActionDto } from './void-transfer-action.dto';
import { LicensesService } from './licenses.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('licenses')
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  generate(@Body() dto: GenerateLicenseDto) {
    return this.licensesService.generate(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.DEVELOPER)
  @Get()
  findAll(@Query('includeVoided') includeVoided?: string) {
    return this.licensesService.findAll(includeVoided === 'true');
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.DEVELOPER)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.licensesService.findOne(id);
  }

  @Roles(UserRole.DEVELOPER)
  @Patch(':id/activate')
  activate(
    @Param('id') id: string,
    @Body() dto: ActivateLicenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.licensesService.activate(id, user.id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.licensesService.suspend(id);
  }

  /** Edit a license (e.g. record the real provider key when a trial is upgraded). */
  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLicenseDto) {
    return this.licensesService.update(id, dto);
  }

  /** Secure void: soft-delete a wrongly-entered license (SUPER_ADMIN only). */
  @Roles(UserRole.SUPER_ADMIN)
  @Post(':id/void')
  void(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: VoidTransferActionDto) {
    return this.licensesService.void(id, user.id, dto);
  }

  /** Transfer this license into the NENPOS table (creates the NENPOS row + voids the license). */
  @Roles(UserRole.SUPER_ADMIN)
  @Post(':id/transfer-to-nenpos')
  transferToNenpos(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: VoidTransferActionDto) {
    return this.licensesService.transferToNenpos(id, user.id, dto);
  }
}
