import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientType } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CreateClientDto } from './create-client.dto';
import { UpdateClientDto } from './update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateClientDto) {
    return this.prisma.client.create({ data: dto });
  }

  findAll(type?: ClientType) {
    return this.prisma.client.findMany({
      where: type ? { clientType: type } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { licenses: true, jobs: true },
    });

    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }

    return client;
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.client.delete({ where: { id } });
  }
}
