import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CreateUserDto } from './create-user.dto';
import { UpdateProfileDto } from './update-profile.dto';
import { UpdateUserDto } from './update-user.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Self-service (must be before /:id routes to avoid route conflict) ───────

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll().then((all) => all.find((u) => u.id === user.id) ?? null);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  // ── Admin operations ─────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get()
  findAll(@Query('role') role?: UserRole) {
    return this.usersService.findAll(role);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.usersService.setActive(id, true);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.usersService.setActive(id, false);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':id/roles')
  addRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.usersService.addRole(id, role);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Delete(':id/roles/:role')
  removeRole(@Param('id') id: string, @Param('role') role: UserRole) {
    return this.usersService.removeRole(id, role);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id/primary-role')
  updatePrimaryRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.usersService.updateRole(id, role);
  }
}
