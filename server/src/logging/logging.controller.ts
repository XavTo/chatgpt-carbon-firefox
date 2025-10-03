import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { CreateLogEventDto } from './dto/create-log-event.dto';
import { LoggingService } from './logging.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ChatUsageService } from '../chat-usage/chat-usage.service';

@Controller('events')
export class LoggingController {
  constructor(
    private readonly loggingService: LoggingService,
    private readonly chatUsageService: ChatUsageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Req() req: Request & { user?: JwtPayload },
    @Body() dto: CreateLogEventDto,
  ) {
    const created = await this.loggingService.create(dto);
    if (dto.type === 'estimation' && req.user?.sub) {
      await this.chatUsageService.recordEstimation(req.user.sub, dto.payload);
    }
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
