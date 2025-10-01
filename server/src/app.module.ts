import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import configuration from './config/configuration';
import { HealthController } from './health.controller';
import { LoggingModule } from './logging/logging.module';

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
        host: config.get<string>('config.database.host'),
        port: config.get<number>('config.database.port'),
        username: config.get<string>('config.database.user'),
        password: config.get<string>('config.database.password'),
        database: config.get<string>('config.database.name'),
        autoLoadEntities: true,
        synchronize: true,
        logging: config.get<boolean>('config.database.logging'),
      }),
    }),
    LoggingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
