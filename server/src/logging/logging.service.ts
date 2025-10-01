import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateLogEventDto } from './dto/create-log-event.dto';
import { LogEvent } from './entities/log-event.entity';

@Injectable()
export class LoggingService {
  constructor(
    @InjectRepository(LogEvent)
    private readonly repo: Repository<LogEvent>,
  ) {}

  async create(dto: CreateLogEventDto): Promise<LogEvent> {
    const entity = this.repo.create({
      type: dto.type,
      requestId: dto.requestId ?? null,
      payload: dto.payload,
    });
    return this.repo.save(entity);
  }

  async getRecent(limit?: number): Promise<LogEvent[]> {
    const numeric = typeof limit === 'number' ? limit : Number.NaN;
    const normalized = Number.isFinite(numeric)
      ? Math.min(Math.max(Math.trunc(numeric), 1), 200)
      : 50;

    return this.repo.find({
      order: { createdAt: 'DESC' },
      take: normalized,
    });
  }

  async countAll(): Promise<number> {
    return this.repo.count();
  }

  async getEstimationSummary() {
    const raw = await this.repo
      .createQueryBuilder('event')
      .select('COUNT(*)', 'count')
      .addSelect("AVG((event.payload->>'durationSec')::numeric)", 'avgDurationSec')
      .addSelect("AVG((event.payload->>'totalWh')::numeric)", 'avgTotalWh')
      .addSelect("AVG((event.payload->>'kgCO2')::numeric)", 'avgKgCO2')
      .where('event.type = :type', { type: 'estimation' })
      .getRawOne<{ count: string | null; avgDurationSec: string | null; avgTotalWh: string | null; avgKgCO2: string | null }>();

    const latest = await this.repo.findOne({
      where: { type: 'estimation' },
      order: { createdAt: 'DESC' },
    });

    return {
      count: raw?.count ? Number(raw.count) : 0,
      averageDurationSec: raw?.avgDurationSec ? Number(raw.avgDurationSec) : null,
      averageTotalWh: raw?.avgTotalWh ? Number(raw.avgTotalWh) : null,
      averageKgCO2: raw?.avgKgCO2 ? Number(raw.avgKgCO2) : null,
      latest,
    };
  }
}
