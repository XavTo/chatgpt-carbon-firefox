import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional } from 'class-validator';

export class UsageSummaryQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value : undefined))
  window?: string;
}
