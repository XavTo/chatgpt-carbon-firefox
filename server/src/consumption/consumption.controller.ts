import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ConsumptionService } from './consumption.service';

interface ConsumptionHistoryQuery {
  page?: string;
  limit?: string;
  from?: string;
  to?: string;
}

interface ConsumptionSummaryQuery {
  from?: string;
  to?: string;
  windowMinutes?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('consumption')
export class ConsumptionController {
  constructor(private readonly consumptionService: ConsumptionService) {}

  @Get('history')
  async history(
    @Req() req: Request & { user?: JwtPayload },
    @Query() query: ConsumptionHistoryQuery,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException('Utilisateur introuvable dans la requête');
    }

    const page = this.parsePositiveInt(query.page, 1) ?? 1;
    const limit = this.parsePositiveInt(query.limit, 10) ?? 10;
    const from = this.parseDate(query.from);
    const to = this.parseDate(query.to);

    if (from && to && from > to) {
      throw new BadRequestException('La date de début doit précéder la date de fin');
    }

    const result = await this.consumptionService.getHistory(userId, {
      page,
      limit,
      from,
      to,
    });

    return {
      ...result,
      items: result.items.map((item) => ({
        id: item.id,
        occurredAt: item.occurredAt,
        requestId: item.requestId,
        durationSec: item.durationSec,
        promptChars: item.promptChars,
        replyChars: item.replyChars,
        reqBytes: Number(item.reqBytes),
        respBytes: Number(item.respBytes),
        totalBytes: Number(item.totalBytes),
        computeWh: item.computeWh,
        networkWh: item.networkWh,
        totalWh: item.totalWh,
        kgCO2: item.kgCO2,
        region: item.region,
        kgPerKWh: item.kgPerKWh,
      })),
      filters: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
    };
  }

  @Get('summary')
  async summary(
    @Req() req: Request & { user?: JwtPayload },
    @Query() query: ConsumptionSummaryQuery,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException('Utilisateur introuvable dans la requête');
    }

    const windowMinutes = this.parsePositiveInt(query.windowMinutes, undefined);
    let from = this.parseDate(query.from);
    const to = this.parseDate(query.to) ?? null;

    if (windowMinutes && !query.from) {
      const end = to ?? new Date();
      from = new Date(end.getTime() - windowMinutes * 60 * 1000);
    }

    if (from && to && from > to) {
      throw new BadRequestException('La date de début doit précéder la date de fin');
    }

    const summary = await this.consumptionService.getSummary(userId, { from, to });

    return {
      ...summary,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    };
  }

  private parsePositiveInt(value: string | undefined, fallback: number | undefined) {
    if (typeof value === 'undefined') {
      return fallback;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      if (fallback === undefined) {
        return undefined;
      }
      return fallback;
    }
    return Math.trunc(numeric);
  }

  private parseDate(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
      throw new BadRequestException(`Date invalide: ${value}`);
    }
    return parsed;
  }
}
