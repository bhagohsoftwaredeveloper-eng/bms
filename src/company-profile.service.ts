import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UpdateCompanyProfileDto } from './update-company-profile.dto';

@Injectable()
export class CompanyProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const profile = await this.prisma.companyProfile.findFirst();
    if (profile) return profile;

    return {
      id: null,
      businessName: '',
      address: null,
      phone: null,
      email: null,
      website: null,
      tin: null,
      logoUrl: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  async update(dto: UpdateCompanyProfileDto) {
    const existing = await this.prisma.companyProfile.findFirst();

    if (existing) {
      return this.prisma.companyProfile.update({
        where: { id: existing.id },
        data: dto,
      });
    }

    return this.prisma.companyProfile.create({
      data: { ...dto, businessName: dto.businessName ?? '' },
    });
  }
}
