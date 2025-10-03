import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, MoreThanOrEqual, LessThanOrEqual, Repository } from 'typeorm';

import { ConsumptionRecord } from '../entities/consumption-record.entity';

export interface EstimationPayload {
  timestamp?: string;
  durationSec?: number;
  promptChars?: number;
  replyChars?: number;
  reqBytes?: number;
  respBytes?: number;
  totalBytes?: number;
  computeWh?: number;
  networkWh?: number;
  totalWh?: number;
  kgCO2?: number;
  region?: string;
  kgPerKWh?: number;
}

export interface HistoryQueryOptions {
  page: number;
  limit: number;
  from?: Date | null;
  to?: Date | null;
}

export interface SummaryQueryOptions {
  from?: Date | null;
  to?: Date | null;
}

@Injectable()
export class ConsumptionService {
  constructor(
    @InjectRepository(ConsumptionRecord)
    private readonly repo: Repository<ConsumptionRecord>,
  ) {}

  async recordEstimation(userId: string, payload: EstimationPayload, requestId: string | null): Promise<void> {
    if (!userId) {
      return;
    }

    const occurredAt = this.resolveTimestamp(payload?.timestamp);
    const record = this.repo.create({
      userId,
      occurredAt,
      requestId,
      durationSec: this.asNumber(payload.durationSec),
      promptChars: this.asInteger(payload.promptChars),
      replyChars: this.asInteger(payload.replyChars),
      reqBytes: this.asBigIntString(payload.reqBytes),
      respBytes: this.asBigIntString(payload.respBytes),
      totalBytes: this.asBigIntString(payload.totalBytes),
      computeWh: this.asNumber(payload.computeWh),
      networkWh: this.asNumber(payload.networkWh),
      totalWh: this.asNumber(payload.totalWh),
      kgCO2: this.asNumber(payload.kgCO2),
      region: typeof payload.region === 'string' && payload.region.trim() ? payload.region.trim() : 'unknown',
      kgPerKWh: this.asNumber(payload.kgPerKWh),
    });

    await this.repo.save(record);
  }

  async getHistory(userId: string, options: HistoryQueryOptions) {
    const page = Math.max(1, Math.trunc(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Math.trunc(options.limit) || 10));
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<ConsumptionRecord> = { userId };

    if (options.from && options.to) {
      where.occurredAt = Between(options.from, options.to);
    } else if (options.from) {
      where.occurredAt = MoreThanOrEqual(options.from);
    } else if (options.to) {
      where.occurredAt = LessThanOrEqual(options.to);
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { occurredAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async getSummary(userId: string, options: SummaryQueryOptions) {
    const qb = this.repo
      .createQueryBuilder('record')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(record.totalWh), 0)', 'totalWh')
      .addSelect('COALESCE(SUM(record.computeWh), 0)', 'totalComputeWh')
      .addSelect('COALESCE(SUM(record.networkWh), 0)', 'totalNetworkWh')
      .addSelect('COALESCE(SUM(record.kgCO2), 0)', 'totalKgCO2')
      .addSelect('COALESCE(SUM(record.totalBytes), 0)', 'totalBytes')
      .addSelect('COALESCE(SUM(record.durationSec), 0)', 'totalDurationSec')
      .where('record.userId = :userId', { userId });

    if (options.from) {
      qb.andWhere('record.occurredAt >= :from', { from: options.from });
    }

    if (options.to) {
      qb.andWhere('record.occurredAt <= :to', { to: options.to });
    }

    const raw = await qb.getRawOne<{
      count: string;
      totalWh: string;
      totalComputeWh: string;
      totalNetworkWh: string;
      totalKgCO2: string;
      totalBytes: string;
      totalDurationSec: string;
    }>();

    return {
      count: raw ? Number(raw.count) : 0,
      totalWh: raw ? Number(raw.totalWh) : 0,
      totalComputeWh: raw ? Number(raw.totalComputeWh) : 0,
      totalNetworkWh: raw ? Number(raw.totalNetworkWh) : 0,
      totalKgCO2: raw ? Number(raw.totalKgCO2) : 0,
      totalBytes: raw ? Number(raw.totalBytes) : 0,
      totalDurationSec: raw ? Number(raw.totalDurationSec) : 0,
    };
  }

  private resolveTimestamp(timestamp?: string) {
    if (timestamp) {
      const parsed = new Date(timestamp);
      if (!Number.isNaN(parsed.valueOf())) {
        return parsed;
      }
    }
    return new Date();
  }

  private asNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private asInteger(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return 0;
    }
    return Math.round(n);
  }

  private asBigIntString(value: unknown): string {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      return '0';
    }
    return Math.round(n).toString();
  }
}
