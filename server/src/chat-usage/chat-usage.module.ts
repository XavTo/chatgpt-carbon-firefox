import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { ChatUsageEntry } from '../entities/chat-usage-entry.entity';
import { ChatUsageController } from './chat-usage.controller';
import { ChatUsageService } from './chat-usage.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatUsageEntry]), AuthModule],
  controllers: [ChatUsageController],
  providers: [ChatUsageService],
  exports: [ChatUsageService],
})
export class ChatUsageModule {}
