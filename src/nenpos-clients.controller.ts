import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { Roles } from './roles.decorator';
import type { AuthenticatedUser } from './authenticated-user.type';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CurrentUser } from './current-user.decorator';
import { CreateNenposClientDto } from './create-nenpos-client.dto';
import { UpdateNenposClientDto } from './update-nenpos-client.dto';
import { VoidTransferActionDto } from './void-transfer-action.dto';
import { NenposClientsService } from './nenpos-clients.service';

const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('nenpos-clients')
export class NenposClientsController {
  constructor(private readonly service: NenposClientsService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get()
  findAll(@Query('includeVoided') includeVoided?: string) {
    return this.service.findAll(includeVoided === 'true');
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Post()
  create(@Body() dto: CreateNenposClientDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          cb(new BadRequestException('Only .xlsx, .xls, or .csv files are allowed.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.service.uploadExcel(file.buffer);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNenposClientDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Delete()
  clearAll() {
    return this.service.deleteAll();
  }

  /** Secure void: soft-delete a NENPOS client record (SUPER_ADMIN only). */
  @Roles(UserRole.SUPER_ADMIN)
  @Post(':id/void')
  void(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: VoidTransferActionDto) {
    return this.service.void(id, user.id, dto);
  }
}
