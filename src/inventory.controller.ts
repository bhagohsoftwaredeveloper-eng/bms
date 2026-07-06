import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user.type';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './create-inventory-item.dto';
import { UpdateInventoryItemDto } from './update-inventory-item.dto';
import { AdjustInventoryDto } from './adjust-inventory.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** List items — any authenticated user (used by the job-order Quick Add). */
  @Get()
  list(@Query('all') all?: string) {
    return this.inventory.list(all === 'true');
  }

  /** Look up one active item by barcode (scan-to-add). */
  @Get('barcode/:code')
  findByBarcode(@Param('code') code: string) {
    return this.inventory.findByBarcode(code);
  }

  /** Stock movement history for one item (most recent first). */
  @Get(':id/movements')
  movements(@Param('id') id: string) {
    return this.inventory.listMovements(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  create(@Body() dto: CreateInventoryItemDto) {
    return this.inventory.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  update(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    return this.inventory.update(id, dto);
  }

  @Post(':id/adjust')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  adjust(@Param('id') id: string, @Body() dto: AdjustInventoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventory.adjustStock(id, dto.delta, user.id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  remove(@Param('id') id: string) {
    return this.inventory.remove(id);
  }
}
