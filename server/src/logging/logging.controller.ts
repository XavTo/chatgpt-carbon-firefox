import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { CreateLogEventDto } from './dto/create-log-event.dto';
import { LoggingService } from './logging.service';

@Controller('events')
export class LoggingController {
  constructor(private readonly loggingService: LoggingService) {}

  @Post()
  async create(@Body() dto: CreateLogEventDto) {
    const created = await this.loggingService.create(dto);
    return { id: created.id, createdAt: created.createdAt };
  }

  @Get('recent')
  async listRecent(@Query('limit') limit?: string) {
    const take = limit ? Number(limit) : undefined;
    const events = await this.loggingService.getRecent(take);
    return events;
  }

  @Get('summary')
  async summary() {
    const [count, estimation] = await Promise.all([
      this.loggingService.countAll(),
      this.loggingService.getEstimationSummary(),
    ]);

    return {
      totalEvents: count,
      estimations: estimation,
    };
  }
}
