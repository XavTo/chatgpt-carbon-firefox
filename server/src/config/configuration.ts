import { registerAs } from '@nestjs/config';

type CorsOrigin = string | RegExp;

function parseOrigins(input?: string): CorsOrigin[] | undefined {
  if (!input || input.trim() === '') {
    return undefined;
  }
  return input.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (value.startsWith('/') && value.endsWith('/')) {
        const body = value.slice(1, -1);
        return new RegExp(body);
      }
      return value;
    });
}

export default registerAs('config', () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'chatgptcarbon',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    logging: (process.env.DB_LOGGING ?? 'false').toLowerCase() === 'true',
  },
}));
