import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CompanyProfileService } from './company-profile.service';
import { UpdateCompanyProfileDto } from './update-company-profile.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('company-profile')
export class CompanyProfileController {
  constructor(private readonly companyProfileService: CompanyProfileService) {}

  @Get()
  get() {
    return this.companyProfileService.get();
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch()
  update(@Body() dto: UpdateCompanyProfileDto) {
    return this.companyProfileService.update(dto);
  }
}
