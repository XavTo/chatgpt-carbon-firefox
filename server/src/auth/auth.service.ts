import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { User } from '../entities/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt-payload.interface';

export interface AuthTokensResponse {
  user: {
    id: string;
    email: string;
    role: 'user' | 'admin';
  };
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  tokenType: 'Bearer';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensResponse> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      throw new ConflictException("Un compte existe déjà pour cette adresse e-mail");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create(email, passwordHash);

    return this.generateAuthTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokensResponse> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    return this.generateAuthTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Jeton de rafraîchissement invalide');
    }

    const tokenMatches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!tokenMatches) {
      throw new UnauthorizedException('Jeton de rafraîchissement invalide');
    }

    return this.generateAuthTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshToken(userId, null);
  }

  private async generateAuthTokens(user: User): Promise<AuthTokensResponse> {
    const role = user.role ?? 'user';
    const payloadBase = {
      sub: user.id,
      email: user.email,
      role,
    };

    const accessTokenTtl = this.accessTokenTtl;
    const refreshTokenTtl = this.refreshTokenTtl;

    const accessToken = await this.jwtService.signAsync(
      { ...payloadBase, type: 'access' },
      {
        secret: this.accessTokenSecret,
        expiresIn: accessTokenTtl,
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      { ...payloadBase, type: 'refresh' },
      {
        secret: this.refreshTokenSecret,
        expiresIn: refreshTokenTtl,
      },
    );

    await this.storeRefreshToken(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        role,
      },
      accessToken,
      refreshToken,
      accessTokenExpiresIn: accessTokenTtl,
      refreshTokenExpiresIn: refreshTokenTtl,
      tokenType: 'Bearer',
    };
  }

  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 12);
    await this.usersService.updateRefreshToken(userId, hash);
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.refreshTokenSecret,
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Jeton de rafraîchissement invalide');
      }

      return payload;
    } catch (error) {
      throw new UnauthorizedException('Jeton de rafraîchissement invalide');
    }
  }

  private get accessTokenSecret(): string {
    return (
      this.configService.get<string>('config.auth.jwtAccessSecret') ??
      'change-me-access-secret'
    );
  }

  private get refreshTokenSecret(): string {
    return (
      this.configService.get<string>('config.auth.jwtRefreshSecret') ??
      'change-me-refresh-secret'
    );
  }

  private get accessTokenTtl(): number {
    return (
      this.configService.get<number>('config.auth.accessTokenTtlSec', { infer: true }) ??
      900
    );
  }

  private get refreshTokenTtl(): number {
    return (
      this.configService.get<number>('config.auth.refreshTokenTtlSec', { infer: true }) ??
      60 * 60 * 24 * 7
    );
  }
}
