import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity({ name: 'consumption_records' })
export class ConsumptionRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Index()
  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 120, nullable: true })
  requestId!: string | null;

  @Column({ type: 'double precision' })
  durationSec!: number;

  @Column({ type: 'integer' })
  promptChars!: number;

  @Column({ type: 'integer' })
  replyChars!: number;

  @Column({ type: 'bigint' })
  reqBytes!: string;

  @Column({ type: 'bigint' })
  respBytes!: string;

  @Column({ type: 'bigint' })
  totalBytes!: string;

  @Column({ type: 'double precision' })
  computeWh!: number;

  @Column({ type: 'double precision' })
  networkWh!: number;

  @Column({ type: 'double precision' })
  totalWh!: number;

  @Column({ type: 'double precision' })
  kgCO2!: number;

  @Column({ type: 'varchar', length: 120 })
  region!: string;

  @Column({ type: 'double precision' })
  kgPerKWh!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
