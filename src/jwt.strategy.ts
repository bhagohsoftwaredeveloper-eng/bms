import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from './prisma.service';
import { AuthenticatedUser } from './authenticated-user.type';

interface JwtPayload {
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { additionalRoles: { select: { role: true } } },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive or no longer exists');
    }

    const roles = [user.role, ...user.additionalRoles.map((r) => r.role)];
    return { id: user.id, email: user.email, role: user.role, roles, fullName: user.fullName };
  }
}
