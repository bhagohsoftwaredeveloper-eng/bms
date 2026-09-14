import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { ItemPackagesService } from './item-packages.service';
import { CreateItemPackageDto, UpdateItemPackageDto } from './create-item-package.dto';

@Controller('item-packages')
@UseGuards(JwtAuthGuard)
export class ItemPackagesController {
  constructor(private readonly packages: ItemPackagesService) {}

  /** List packages — any authenticated user (drives the Job Order package insert). */
  @Get()
  list(@Query('all') all?: string) {
    return this.packages.list(all === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.packages.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  create(@Body() dto: CreateItemPackageDto) {
    return this.packages.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  update(@Param('id') id: string, @Body() dto: UpdateItemPackageDto) {
    return this.packages.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  remove(@Param('id') id: string) {
    return this.packages.remove(id);
  }
}
