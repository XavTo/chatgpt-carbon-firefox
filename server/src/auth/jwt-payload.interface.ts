import { UserRole } from '../entities/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}
