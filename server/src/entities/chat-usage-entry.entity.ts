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

@Entity({ name: 'chat_usage_entries' })
@Index(['userId', 'occurredAt'])
export class ChatUsageEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  url!: string | null;

  @Column({ type: 'integer', nullable: true })
  promptChars!: number | null;

  @Column({ type: 'integer', nullable: true })
  replyChars!: number | null;

  @Column({ type: 'bigint', nullable: true })
  totalBytes!: string | null;

  @Column({ type: 'double precision', nullable: true })
  durationSec!: number | null;

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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
