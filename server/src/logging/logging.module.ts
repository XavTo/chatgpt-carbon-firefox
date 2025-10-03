import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LogEvent } from '../entities/log-event.entity';
import { AuthModule } from '../auth/auth.module';
import { ConsumptionModule } from '../consumption/consumption.module';
import { LoggingController } from './logging.controller';
import { LoggingService } from './logging.service';

@Module({
  imports: [TypeOrmModule.forFeature([LogEvent]), AuthModule, ConsumptionModule],
  controllers: [LoggingController],
  providers: [LoggingService],
  exports: [LoggingService],
})
export class LoggingModule {}
