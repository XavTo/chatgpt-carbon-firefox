import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LogEvent } from '../entities/log-event.entity';
import { AuthModule } from '../auth/auth.module';
import { ChatUsageModule } from '../chat-usage/chat-usage.module';
import { LoggingController } from './logging.controller';
import { LoggingService } from './logging.service';

@Module({
  imports: [TypeOrmModule.forFeature([LogEvent]), AuthModule, ChatUsageModule],
  controllers: [LoggingController],
  providers: [LoggingService],
  exports: [LoggingService],
})
export class LoggingModule {}
