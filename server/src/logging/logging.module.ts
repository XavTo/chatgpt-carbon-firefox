import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LogEvent } from '../entities/log-event.entity';
import { LoggingController } from './logging.controller';
import { LoggingService } from './logging.service';

@Module({
  imports: [TypeOrmModule.forFeature([LogEvent])],
  controllers: [LoggingController],
  providers: [LoggingService],
  exports: [LoggingService],
})
export class LoggingModule {}
