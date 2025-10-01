import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'log_events' })
export class LogEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ length: 120 })
  @Index()
  type!: string;

  @Column({ nullable: true, length: 120 })
  requestId!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;
}
