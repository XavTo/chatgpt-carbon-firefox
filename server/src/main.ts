import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOrigins = configService.get<(string | RegExp)[] | undefined>('config.app.corsOrigins');

  // If CORS_ORIGINS is provided via config, use it. Otherwise allow common
  // development origins (localhost) and browser-extension protocols so
  // popup scripts can call the API during development.
  // If you want to allow requests from any origin (useful for extension/backoffice
  // scenarios), set originOption to true. Be careful: allowing any origin is not
  // recommended for production APIs that are publicly accessible with credentials.
  const originOption = corsOrigins ?? true;

  app.enableCors({
    origin: originOption,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
  }));

  await app.listen(process.env.PORT ?? 5000);
  console.log(`ChatGPT Carbon telemetry server ready on port ${process.env.PORT ?? 5000}`);
}

bootstrap();
