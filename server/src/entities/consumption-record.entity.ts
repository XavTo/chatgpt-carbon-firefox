import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';

import { User } from './user.entity';

@Entity({ name: 'consumption_records' })
export class ConsumptionRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Index()
  user!: User;

  @RelationId((record: ConsumptionRecord) => record.user)
  userId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  eventTimestamp!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  requestId!: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  url!: string | null;

  @Column({ type: 'double precision', nullable: true })
  durationSec!: number | null;

  @Column({ type: 'integer', nullable: true })
  promptChars!: number | null;

  @Column({ type: 'integer', nullable: true })
  replyChars!: number | null;

  @Column({ type: 'bigint', nullable: true })
  requestBytes!: string | null;

  @Column({ type: 'bigint', nullable: true })
  responseBytes!: string | null;

  @Column({ type: 'bigint', nullable: true })
  totalBytes!: string | null;

  @Column({ type: 'double precision', nullable: true })
  computeWh!: number | null;

  @Column({ type: 'double precision', nullable: true })
  networkWh!: number | null;

  @Column({ type: 'double precision', nullable: true })
  totalWh!: number | null;

  @Column({ type: 'double precision', nullable: true })
  kgCO2!: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  region!: string | null;

  @Column({ type: 'double precision', nullable: true })
  kgPerKWh!: number | null;
}
