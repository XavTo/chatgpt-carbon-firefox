import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import configuration from './config/configuration';
import { HealthController } from './health.controller';
import { LoggingModule } from './logging/logging.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('config.database.url'),
        autoLoadEntities: true,
        synchronize: true,
        logging: config.get<boolean>('config.database.logging') || false,
      }),
    }),
    LoggingModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
