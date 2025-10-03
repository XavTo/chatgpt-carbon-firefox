import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { ConsumptionRecord } from '../entities/consumption-record.entity';
import { User } from '../entities/user.entity';
import { ConsumptionHistoryQueryDto } from './dto/consumption-history-query.dto';
import { ConsumptionSummaryQueryDto } from './dto/consumption-summary-query.dto';

export interface ConsumptionRecordResponse {
  id: string;
  createdAt: string;
  eventTimestamp: string | null;
  requestId: string | null;
  url: string | null;
  durationSec: number | null;
  promptChars: number | null;
  replyChars: number | null;
  requestBytes: number | null;
  responseBytes: number | null;
  totalBytes: number | null;
  computeWh: number | null;
  networkWh: number | null;
  totalWh: number | null;
  kgCO2: number | null;
  region: string | null;
  kgPerKWh: number | null;
}

export interface ConsumptionHistoryResult {
  items: ConsumptionRecordResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ConsumptionSummaryResult {
  totalRequests: number;
  totalComputeWh: number;
  totalNetworkWh: number;
  totalWh: number;
  totalKgCO2: number;
  from?: string | null;
  to?: string | null;
  lastRecordAt?: string | null;
  updatedAt: string;
}

@Injectable()
export class ConsumptionService {
  constructor(
    @InjectRepository(ConsumptionRecord)
    private readonly repository: Repository<ConsumptionRecord>,
  ) {}

  async createFromEstimation(
    userId: string,
    requestId: string | null,
    payload: Record<string, unknown>,
  ): Promise<ConsumptionRecord> {
    const record = this.repository.create({
      user: { id: userId } as User,
      requestId,
      url: this.toString(payload.url),
      eventTimestamp: this.toDate(payload.timestamp),
      durationSec: this.toNumber(payload.durationSec),
      promptChars: this.toInteger(payload.promptChars),
      replyChars: this.toInteger(payload.replyChars),
      requestBytes: this.toBigIntString(payload.reqBytes),
      responseBytes: this.toBigIntString(payload.respBytes),
      totalBytes: this.toBigIntString(payload.totalBytes),
      computeWh: this.toNumber(payload.computeWh),
      networkWh: this.toNumber(payload.networkWh),
      totalWh: this.toNumber(payload.totalWh),
      kgCO2: this.toNumber(payload.kgCO2),
      region: this.toString(payload.region),
      kgPerKWh: this.toNumber(payload.kgPerKWh),
    });

    return this.repository.save(record);
  }

  async getHistory(
    userId: string,
    query: ConsumptionHistoryQueryDto,
  ): Promise<ConsumptionHistoryResult> {
    const page = Number.isFinite(query.page as number)
      ? Math.max(1, Math.trunc(query.page!))
      : 1;
    const pageSize = Number.isFinite(query.pageSize as number)
      ? Math.min(100, Math.max(1, Math.trunc(query.pageSize!)))
      : 10;

    const from = this.parseIsoDate(query.from);
    const to = this.parseIsoDate(query.to);

    const baseQb = this.repository
      .createQueryBuilder('record')
      .where('record.user_id = :userId', { userId });
    this.applyWindow(baseQb, from, to);

    const total = await baseQb.clone().getCount();
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
    const currentPage = totalPages > 0 ? Math.min(page, totalPages) : page;

    const records = await baseQb
      .clone()
      .orderBy('COALESCE(record.eventTimestamp, record.createdAt)', 'DESC')
      .addOrderBy('record.createdAt', 'DESC')
      .skip((currentPage - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      items: records.map((record) => this.mapRecord(record)),
      total,
      page: currentPage,
      pageSize,
      totalPages,
    };
  }

  async getSummary(
    userId: string,
    query: ConsumptionSummaryQueryDto,
  ): Promise<ConsumptionSummaryResult> {
    const from = this.parseIsoDate(query.from);
    const to = this.parseIsoDate(query.to);

    const baseQb = this.repository
      .createQueryBuilder('record')
      .where('record.user_id = :userId', { userId });
    this.applyWindow(baseQb, from, to);

    const raw = await baseQb
      .clone()
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(record.computeWh), 0)', 'computeWh')
      .addSelect('COALESCE(SUM(record.networkWh), 0)', 'networkWh')
      .addSelect('COALESCE(SUM(record.totalWh), 0)', 'totalWh')
      .addSelect('COALESCE(SUM(record.kgCO2), 0)', 'kgCO2')
      .getRawOne<{
        count: string;
        computeWh: string | null;
        networkWh: string | null;
        totalWh: string | null;
        kgCO2: string | null;
      }>();

    const latest = await baseQb
      .clone()
      .orderBy('COALESCE(record.eventTimestamp, record.createdAt)', 'DESC')
      .addOrderBy('record.createdAt', 'DESC')
      .getOne();

    return {
      totalRequests: raw?.count ? Number(raw.count) : 0,
      totalComputeWh: this.toSafeNumber(raw?.computeWh) ?? 0,
      totalNetworkWh: this.toSafeNumber(raw?.networkWh) ?? 0,
      totalWh: this.toSafeNumber(raw?.totalWh) ?? 0,
      totalKgCO2: this.toSafeNumber(raw?.kgCO2) ?? 0,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      lastRecordAt: latest
        ? (latest.eventTimestamp ?? latest.createdAt)?.toISOString()
        : null,
      updatedAt: new Date().toISOString(),
    };
  }

  private applyWindow(
    qb: SelectQueryBuilder<ConsumptionRecord>,
    from: Date | null,
    to: Date | null,
  ) {
    if (from) {
      qb.andWhere('COALESCE(record.eventTimestamp, record.createdAt) >= :from', {
        from,
      });
    }
    if (to) {
      qb.andWhere('COALESCE(record.eventTimestamp, record.createdAt) <= :to', {
        to,
      });
    }
  }

  private mapRecord(record: ConsumptionRecord): ConsumptionRecordResponse {
    const eventDate = record.eventTimestamp ?? record.createdAt;
    return {
      id: record.id,
      createdAt: record.createdAt.toISOString(),
      eventTimestamp: eventDate ? eventDate.toISOString() : null,
      requestId: record.requestId,
      url: record.url,
      durationSec: this.toSafeNumber(record.durationSec),
      promptChars: this.toSafeNumber(record.promptChars),
      replyChars: this.toSafeNumber(record.replyChars),
      requestBytes: this.toSafeNumber(record.requestBytes),
      responseBytes: this.toSafeNumber(record.responseBytes),
      totalBytes: this.toSafeNumber(record.totalBytes),
      computeWh: this.toSafeNumber(record.computeWh),
      networkWh: this.toSafeNumber(record.networkWh),
      totalWh: this.toSafeNumber(record.totalWh),
      kgCO2: this.toSafeNumber(record.kgCO2),
      region: record.region,
      kgPerKWh: this.toSafeNumber(record.kgPerKWh),
    };
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private toSafeNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'bigint') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private toInteger(value: unknown): number | null {
    const numberValue = this.toNumber(value);
    if (numberValue == null) return null;
    const rounded = Math.round(numberValue);
    return Number.isFinite(rounded) ? rounded : null;
  }

  private toBigIntString(value: unknown): string | null {
    if (value == null) {
      return null;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value).toString();
    }
    if (typeof value === 'string' && value.trim() !== '') {
      try {
        const bigIntValue = BigInt(value);
        return bigIntValue.toString();
      } catch (err) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return Math.round(parsed).toString();
        }
      }
    }
    return null;
  }

  private toString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
    return null;
  }

  private toDate(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return null;
  }

  private parseIsoDate(value?: string): Date | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date;
  }
}
