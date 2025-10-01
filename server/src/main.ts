import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { AppModule } from './app.module';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
  }));

  await app.listen(process.env.PORT ?? 5000);
  console.log(`ChatGPT Carbon telemetry server ready on port ${process.env.PORT ?? 5000}`);
}

bootstrap();
