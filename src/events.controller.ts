import { Controller, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Sse()
  stream(@Query('token') token: string): Observable<MessageEvent> {
    if (!token) throw new UnauthorizedException();

    let userId: string | undefined;
    try {
      const payload = this.jwtService.verify<{ sub?: string }>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException();
    }

    return this.eventsService.stream(userId);
  }
}
