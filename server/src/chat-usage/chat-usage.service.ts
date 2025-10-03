import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  ILike,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import { ChatUsageEntry } from '../entities/chat-usage-entry.entity';
import { UsageHistoryQueryDto } from './dto/history-query.dto';
import { UsageSummaryQueryDto } from './dto/summary-query.dto';

export interface UsageHistoryItem {
  id: string;
  occurredAt: Date;
  createdAt: Date;
  url: string | null;
  promptChars: number | null;
  replyChars: number | null;
  durationSec: number | null;
  computeWh: number | null;
  networkWh: number | null;
  totalWh: number | null;
  kgCO2: number | null;
  totalBytes: string | null;
  region: string | null;
  kgPerKWh: number | null;
}

function toNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toInteger(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return Math.trunc(num);
}

function toBigIntValue(value: unknown): bigint | null {
  if (value == null) {
    return null;
  }
  try {
    return BigInt(value as any);
  } catch (error) {
    return null;
  }
}

function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  try {
    const date = new Date(value as string);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch (error) {
    return null;
  }
}

@Injectable()
export class ChatUsageService {
  private readonly logger = new Logger(ChatUsageService.name);

  constructor(
    @InjectRepository(ChatUsageEntry)
    private readonly repo: Repository<ChatUsageEntry>,
  ) {}

  async recordEstimation(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<ChatUsageEntry> {
    const occurredAt = toDate(payload.timestamp) ?? new Date();

    const entry = this.repo.create({
      userId,
      occurredAt,
      url: typeof payload.url === 'string' ? payload.url : null,
      promptChars: toInteger(payload.promptChars),
      replyChars: toInteger(payload.replyChars),
      totalBytes: this.computeTotalBytes(payload),
      durationSec: toNumber(payload.durationSec),
      computeWh: toNumber(payload.computeWh),
      networkWh: toNumber(payload.networkWh),
      totalWh: toNumber(payload.totalWh),
      kgCO2: toNumber(payload.kgCO2),
      region: typeof payload.region === 'string' ? payload.region : null,
      kgPerKWh: toNumber(payload.kgPerKWh),
    });

    try {
      return await this.repo.save(entry);
    } catch (error) {
      this.logger.error('Failed to persist chat usage entry', error as Error);
      throw error;
    }
  }

  private computeTotalBytes(payload: Record<string, unknown>): string | null {
    const total = toBigIntValue(payload.totalBytes);
    if (total !== null) {
      return total.toString();
    }

    const zero = BigInt(0);
    const requestBytes = toBigIntValue(payload.reqBytes) ?? zero;
    const responseBytes = toBigIntValue(payload.respBytes) ?? zero;

    if (requestBytes === zero && responseBytes === zero) {
      return null;
    }

    return (requestBytes + responseBytes).toString();
  }

  async getHistory(
    userId: string,
    query: UsageHistoryQueryDto,
  ): Promise<{
    items: UsageHistoryItem[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: FindOptionsWhere<ChatUsageEntry> = { userId };

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && to) {
      where.occurredAt = Between(from, to);
    } else if (from) {
      where.occurredAt = MoreThanOrEqual(from);
    } else if (to) {
      where.occurredAt = LessThanOrEqual(to);
    }

    if (query.search) {
      where.url = ILike(`%${query.search}%`);
    }

    const [items, totalItems] = await this.repo.findAndCount({
      where,
      order: { occurredAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);

    const normalized = items.map((item) => ({
      id: item.id,
      occurredAt: item.occurredAt,
      createdAt: item.createdAt,
      url: item.url,
      promptChars: item.promptChars,
      replyChars: item.replyChars,
      durationSec: item.durationSec,
      computeWh: item.computeWh,
      networkWh: item.networkWh,
      totalWh: item.totalWh,
      kgCO2: item.kgCO2,
      totalBytes: item.totalBytes,
      region: item.region,
      kgPerKWh: item.kgPerKWh,
    }));

    return { items: normalized, page, pageSize, totalItems, totalPages };
  }

  async getSummary(
    userId: string,
    query: UsageSummaryQueryDto,
  ): Promise<{
    from: string | null;
    to: string | null;
    totalRequests: number;
    totalDurationSec: number;
    totalPromptChars: number;
    totalReplyChars: number;
    totalBytes: string;
    totalComputeWh: number;
    totalNetworkWh: number;
    totalWh: number;
    totalKgCO2: number;
  }> {
    let from = query.from ? new Date(query.from) : null;
    let to = query.to ? new Date(query.to) : null;

    if ((!from || !to) && query.window) {
      const range = this.resolveWindow(query.window);
      if (range) {
        from = range.from ?? from;
        to = range.to ?? to;
      }
    }

    const qb = this.repo
      .createQueryBuilder('entry')
      .select('COUNT(*)', 'totalRequests')
      .addSelect('COALESCE(SUM(entry.durationSec), 0)', 'totalDurationSec')
      .addSelect('COALESCE(SUM(entry.promptChars), 0)', 'totalPromptChars')
      .addSelect('COALESCE(SUM(entry.replyChars), 0)', 'totalReplyChars')
      .addSelect('COALESCE(SUM(entry.totalBytes), 0)', 'totalBytes')
      .addSelect('COALESCE(SUM(entry.computeWh), 0)', 'totalComputeWh')
      .addSelect('COALESCE(SUM(entry.networkWh), 0)', 'totalNetworkWh')
      .addSelect('COALESCE(SUM(entry.totalWh), 0)', 'totalWh')
      .addSelect('COALESCE(SUM(entry.kgCO2), 0)', 'totalKgCO2')
      .where('entry.userId = :userId', { userId });

    if (from) {
      qb.andWhere('entry.occurredAt >= :from', { from });
    }
    if (to) {
      qb.andWhere('entry.occurredAt <= :to', { to });
    }

    const raw = await qb.getRawOne<{
      totalRequests: string;
      totalDurationSec: string;
      totalPromptChars: string;
      totalReplyChars: string;
      totalBytes: string;
      totalComputeWh: string;
      totalNetworkWh: string;
      totalWh: string;
      totalKgCO2: string;
    }>();

    return {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      totalRequests: raw?.totalRequests ? Number(raw.totalRequests) : 0,
      totalDurationSec: raw?.totalDurationSec ? Number(raw.totalDurationSec) : 0,
      totalPromptChars: raw?.totalPromptChars ? Number(raw.totalPromptChars) : 0,
      totalReplyChars: raw?.totalReplyChars ? Number(raw.totalReplyChars) : 0,
      totalBytes: raw?.totalBytes ?? '0',
      totalComputeWh: raw?.totalComputeWh ? Number(raw.totalComputeWh) : 0,
      totalNetworkWh: raw?.totalNetworkWh ? Number(raw.totalNetworkWh) : 0,
      totalWh: raw?.totalWh ? Number(raw.totalWh) : 0,
      totalKgCO2: raw?.totalKgCO2 ? Number(raw.totalKgCO2) : 0,
    };
  }

  private resolveWindow(window: string): { from: Date | null; to: Date | null } | null {
    const now = new Date();
    switch (window) {
      case '24h':
        return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
      case '7d':
        return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
      case '30d':
        return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now };
      case 'all':
        return { from: null, to: null };
      default:
        return null;
    }
  }
}
