import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const header = request.headers['authorization'];

    if (!header || Array.isArray(header) || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Jeton d\'authentification manquant');
    }

    const token = header.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Jeton d\'authentification invalide');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('config.auth.jwtAccessSecret'),
      });

      if (payload.type !== 'access') {
        throw new UnauthorizedException('Type de jeton invalide');
      }

      request.user = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Jeton d\'authentification invalide');
    }
  }
}
