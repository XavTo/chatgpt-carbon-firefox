import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConsumptionRecord } from '../entities/consumption-record.entity';
import { ConsumptionController } from './consumption.controller';
import { ConsumptionService } from './consumption.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConsumptionRecord])],
  controllers: [ConsumptionController],
  providers: [ConsumptionService],
  exports: [ConsumptionService],
})
export class ConsumptionModule {}
