import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LicenseStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { ActivateLicenseDto } from './activate-license.dto';
import { GenerateLicenseDto } from './generate-license.dto';
import { LicenseCryptoService } from './license-crypto.service';

@Injectable()
export class LicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly licenseCrypto: LicenseCryptoService,
  ) {}

  async generate(dto: GenerateLicenseDto) {
    const [client, product] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: dto.clientId } }),
      this.prisma.softwareProduct.findUnique({ where: { id: dto.productId } }),
    ]);

    if (!client) throw new NotFoundException(`Client ${dto.clientId} not found`);
    if (!product) throw new NotFoundException(`Software product ${dto.productId} not found`);

    const existing = await this.prisma.license.findUnique({
      where: { licenseKey: dto.licenseKey },
    });
    if (existing) {
      throw new ConflictException('A license with this key already exists');
    }

    return this.prisma.license.create({
      data: {
        licenseKey: dto.licenseKey,
        clientId: dto.clientId,
        productId: dto.productId,
        expirationDate: dto.expirationDate,
        status: LicenseStatus.PENDING,
      },
    });
  }

  findAll() {
    return this.prisma.license.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: true, product: true },
    });
  }

  async findOne(id: string) {
    const license = await this.prisma.license.findUnique({
      where: { id },
      include: { client: true, product: true, activatedBy: true },
    });

    if (!license) {
      throw new NotFoundException(`License ${id} not found`);
    }

    return license;
  }

  /**
   * Developer activation step: binds the license to the requesting machine's
   * hardware fingerprint and issues an RS256 (RSA-4096) signed JWT license token.
   */
  async activate(id: string, developerId: string, dto: ActivateLicenseDto) {
    const license = await this.findOne(id);

    if (license.status === LicenseStatus.ACTIVATED) {
      throw new ConflictException('License is already activated');
    }

    const activationDate = new Date();
    const licenseToken = this.licenseCrypto.signLicenseToken(
      {
        licenseId: license.id,
        licenseKey: license.licenseKey,
        clientId: license.clientId,
        productId: license.productId,
        fingerprint: dto.fingerprint,
      },
      license.expirationDate ?? undefined,
    );

    return this.prisma.license.update({
      where: { id },
      data: {
        status: LicenseStatus.ACTIVATED,
        activatedById: developerId,
        activationDate,
        hardwareFingerprint: dto.fingerprint as unknown as object,
        licenseToken,
      },
    });
  }

  async suspend(id: string) {
    await this.findOne(id);
    return this.prisma.license.update({ where: { id }, data: { status: LicenseStatus.SUSPENDED } });
  }
}
