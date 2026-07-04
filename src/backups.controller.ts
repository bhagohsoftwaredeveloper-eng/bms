import { Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { BackupsService } from './backups.service';
import { ResetService } from './reset.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('backups')
export class BackupsController {
  constructor(
    private readonly backupsService: BackupsService,
    private readonly resetService: ResetService,
  ) {}

  @Get()
  list() {
    return this.backupsService.list();
  }

  @Post()
  create() {
    return this.backupsService.create();
  }

  @Get(':filename/download')
  download(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = this.backupsService.getFilePath(filename);
    res.download(filePath, filename);
  }

  @Delete(':filename')
  remove(@Param('filename') filename: string) {
    return this.backupsService.remove(filename);
  }

  @Get('reset/modules')
  resetModules() {
    return this.resetService.list();
  }

  @Post('reset/:moduleId')
  resetModule(@Param('moduleId') moduleId: string) {
    return this.resetService.reset(moduleId);
  }
}
