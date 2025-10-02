export interface JwtPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}
