import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma.service';
import { CreateUserDto } from './create-user.dto';
import { UpdateProfileDto } from './update-profile.dto';
import { UpdateUserDto } from './update-user.dto';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  phone: true,
  isActive: true,
  mfaEnabled: true,
  baseBonus: true,
  createdAt: true,
  additionalRoles: { select: { role: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('A user with this email already exists');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    
    // Filter out primary role from additionalRoles if it was accidentally included
    const additionalRoles = (dto.additionalRoles ?? [])
      .filter((r) => r !== dto.role)
      .map((role) => ({ role }));

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        phone: dto.phone,
        baseBonus: dto.baseBonus ?? undefined,
        additionalRoles: { create: additionalRoles },
      },
      select: SAFE_USER_SELECT,
    });
  }

  findAll(role?: UserRole) {
    return this.prisma.user.findMany({
      where: role
        ? { OR: [{ role }, { additionalRoles: { some: { role } } }] }
        : undefined,
      orderBy: { createdAt: 'desc' },
      select: SAFE_USER_SELECT,
    });
  }

  async setActive(id: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.prisma.user.update({ where: { id }, data: { isActive }, select: SAFE_USER_SELECT });
  }

  // ── Admin edit any user ─────────────────────────────────────────────────────

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    if (dto.email && dto.email !== user.email) {
      const clash = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (clash) throw new ConflictException('Email already in use by another account');
    }

    const primaryRole = dto.role ?? user.role;
    
    // Prepare update data
    const data: any = {
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone ?? null,
      role: dto.role,
      baseBonus: dto.baseBonus ?? undefined,
    };

    // If primary role changed, ensure it's removed from additionalRoles
    if (dto.role && dto.role !== user.role) {
      if (!data.additionalRoles) data.additionalRoles = {};
      data.additionalRoles.deleteMany = { role: dto.role };
    }

    // Handle additional roles if provided
    if (dto.additionalRoles) {
      // Filter out primary role from additionalRoles
      const rolesToAdd = dto.additionalRoles
        .filter((r) => r !== primaryRole)
        .map((role) => ({ role }));

      if (!data.additionalRoles) data.additionalRoles = {};
      data.additionalRoles.deleteMany = {}; // Clear all if explicitly provided
      data.additionalRoles.create = rolesToAdd;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: SAFE_USER_SELECT,
    });
  }

  // ── Self profile update ─────────────────────────────────────────────────────

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.email && dto.email !== user.email) {
      const clash = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (clash) throw new ConflictException('Email already in use by another account');
    }

    if (dto.newPassword) {
      if (!dto.currentPassword) throw new BadRequestException('Current password is required to set a new one');
      const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!matches) throw new UnauthorizedException('Current password is incorrect');
    }

    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.newPassword) data.passwordHash = await bcrypt.hash(dto.newPassword, 12);

    return this.prisma.user.update({ where: { id: userId }, data, select: SAFE_USER_SELECT });
  }

  // ── Role assignment ─────────────────────────────────────────────────────────

  async addRole(userId: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    await this.prisma.userRoleAssignment.upsert({
      where: { userId_role: { userId, role } },
      create: { userId, role },
      update: {},
    });

    return this.prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT });
  }

  async removeRole(userId: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    await this.prisma.userRoleAssignment.deleteMany({ where: { userId, role } });
    return this.prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT });
  }

  async updateRole(userId: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    // Remove new primary from additionalRoles if present
    await this.prisma.userRoleAssignment.deleteMany({ where: { userId, role } });
    return this.prisma.user.update({ where: { id: userId }, data: { role }, select: SAFE_USER_SELECT });
  }
}
