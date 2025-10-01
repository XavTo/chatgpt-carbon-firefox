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
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ length: 120 })
  @Index()
  type: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  requestId: string | null;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;
}
