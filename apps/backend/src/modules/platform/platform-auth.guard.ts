import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/** Guards master-admin routes: requires a JWT with scope="platform". */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth: string = req.headers?.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing platform token');
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: this.config.get<string>('JWT_SECRET') });
      if (payload.scope !== 'platform') throw new Error('wrong scope');
      req.platformAdmin = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid platform token');
    }
  }
}
