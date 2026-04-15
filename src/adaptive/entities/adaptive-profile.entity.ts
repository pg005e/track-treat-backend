import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from 'src/user/entities';

@Entity('adaptive_profiles')
@Unique(['userId', 'weekStartDate'])
@Index(['userId'])
export class AdaptiveProfileEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'date', name: 'week_start_date' })
  weekStartDate: string;

  @Column({ type: 'varchar', length: 20 })
  quadrant: string; // 'ideal' | 'plan_wrong' | 'self_directed' | 'struggling'

  @Column({ type: 'varchar', name: 'strictness_level', length: 20 })
  strictnessLevel: string; // 'lenient' | 'moderate' | 'strict'

  @Column({ type: 'varchar', name: 'plan_mode', length: 20 })
  planMode: string; // 'prescriptive' | 'flexible' | 'suggestive'

  @Column({ type: 'numeric', name: 'pressure_score', precision: 5, scale: 2 })
  pressureScore: number;

  @Column({ type: 'integer', name: 'complexity_target' })
  complexityTarget: number;

  @Column({ name: 'simplify_flag', default: false })
  simplifyFlag: boolean;

  @Column({ name: 'recalibrate_flag', default: false })
  recalibrateFlag: boolean;

  @Column({ type: 'numeric', name: 'adherence_score', precision: 5, scale: 4 })
  adherenceScore: number;

  @Column({ type: 'numeric', name: 'outcome_score', precision: 5, scale: 4 })
  outcomeScore: number;

  @Column({ type: 'integer', name: 'week_streak', default: 0 })
  weekStreak: number;

  @Column({ type: 'integer', name: 'week_number', default: 1 })
  weekNumber: number;

  @Column({ type: 'integer', array: true, name: 'skipped_foods', default: '{}' })
  skippedFoods: number[];

  @Column({ type: 'integer', array: true, name: 'preferred_foods', default: '{}' })
  preferredFoods: number[];

  @Column({ type: 'jsonb', name: 'slot_adherence', default: '{}' })
  slotAdherence: Record<string, number>;

  @Column({ type: 'timestamptz', name: 'computed_at' })
  computedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
