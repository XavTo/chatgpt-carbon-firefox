import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { CreateLogEventDto } from './dto/create-log-event.dto';
import { LoggingService } from './logging.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Controller('events')
export class LoggingController {
  constructor(private readonly loggingService: LoggingService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() dto: CreateLogEventDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const created = await this.loggingService.create(dto, req.user ?? null);
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
