import { Body, Controller, Post } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateDownloadLeadDto } from './create-download-lead.dto';
import { SendLeadCodeDto } from './send-lead-code.dto';
import { DownloadLeadsService } from './download-leads.service';

/** Public endpoints: the landing page collects company details before a download. */
@Controller('download-leads')
export class DownloadLeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: DownloadLeadsService,
  ) {}

  @Post('send-code')
  async sendCode(@Body() dto: SendLeadCodeDto) {
    return { sent: await this.leads.sendCode(dto.email) };
  }

  @Post()
  async create(@Body() dto: CreateDownloadLeadDto) {
    let emailVerified = false;
    if (dto.code) {
      this.leads.verifyAndConsume(dto.email, dto.code);
      emailVerified = true;
    }
    const lead = await this.prisma.downloadLead.create({
      data: {
        companyName: dto.companyName,
        contactPerson: dto.contactPerson,
        contactNo: dto.contactNo,
        email: dto.email.trim().toLowerCase(),
        emailVerified,
        platform: dto.platform,
      },
    });
    return { id: lead.id };
  }
}
