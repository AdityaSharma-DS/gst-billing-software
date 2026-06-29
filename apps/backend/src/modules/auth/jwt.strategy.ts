import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;        // user id
  tenantId: string;
  role: 'ADMIN' | 'ACCOUNTANT' | 'VIEWER';
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'dev-secret',
    });
  }

  async validate(payload: JwtPayload) {
    // Attached to req.user; tenantId here should override any header.
    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
    };
  }
}
