import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOrigins = configService.get<(string | RegExp)[] | undefined>('config.app.corsOrigins');

  app.enableCors({
    origin: corsOrigins ?? true,
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
