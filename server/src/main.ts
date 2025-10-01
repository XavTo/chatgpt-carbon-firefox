import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

type CorsOrigin = string | RegExp;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);

  const origins = configService.get<CorsOrigin[] | undefined>('config.app.corsOrigins');
  app.enableCors({
    origin: origins ?? true,
    credentials: false,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const port = configService.get<number>('config.app.port', 3000);
  await app.listen(port);
  console.log(`ChatGPT Carbon telemetry server ready on port ${port}`);
}

bootstrap();
