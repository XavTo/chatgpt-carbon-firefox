import { Controller, Get, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ConsumptionService } from './consumption.service';
import { ConsumptionHistoryQueryDto } from './dto/consumption-history-query.dto';
import { ConsumptionSummaryQueryDto } from './dto/consumption-summary-query.dto';

@Controller('consumption')
@UseGuards(JwtAuthGuard)
export class ConsumptionController {
  constructor(private readonly consumptionService: ConsumptionService) {}

  @Get('history')
  async history(
    @Req() req: Request & { user?: JwtPayload },
    @Query() query: ConsumptionHistoryQueryDto,
  ) {
    if (!req.user) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    return this.consumptionService.getHistory(req.user.sub, query);
  }

  @Get('summary')
  async summary(
    @Req() req: Request & { user?: JwtPayload },
    @Query() query: ConsumptionSummaryQueryDto,
  ) {
    if (!req.user) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    return this.consumptionService.getSummary(req.user.sub, query);
  }
}
