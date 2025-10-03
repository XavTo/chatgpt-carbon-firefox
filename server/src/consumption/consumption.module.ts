import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConsumptionRecord } from '../entities/consumption-record.entity';
import { AuthModule } from '../auth/auth.module';
import { ConsumptionController } from './consumption.controller';
import { ConsumptionService } from './consumption.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConsumptionRecord]), AuthModule],
  controllers: [ConsumptionController],
  providers: [ConsumptionService],
  exports: [ConsumptionService],
})
export class ConsumptionModule {}
