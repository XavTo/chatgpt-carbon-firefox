import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ChatUsageService } from './chat-usage.service';
import { UsageHistoryQueryDto } from './dto/history-query.dto';
import { UsageSummaryQueryDto } from './dto/summary-query.dto';

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class ChatUsageController {
  constructor(private readonly chatUsageService: ChatUsageService) {}

  @Get()
  async history(
    @Req() req: Request & { user?: JwtPayload },
    @Query() query: UsageHistoryQueryDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.chatUsageService.getHistory(userId, query);
  }

  @Get('summary')
  async summary(
    @Req() req: Request & { user?: JwtPayload },
    @Query() query: UsageSummaryQueryDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.chatUsageService.getSummary(userId, query);
  }
}
