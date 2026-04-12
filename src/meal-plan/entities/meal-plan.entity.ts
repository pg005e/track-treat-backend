import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from 'src/user/entities';
import { MealPlanItem } from './meal-plan-item.entity';

export enum MealPlanStatus {
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

@Entity('meal_plans')
@Index(['userId', 'status'])
export class MealPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'date', name: 'start_date' })
  startDate: string;

  @Column({ type: 'date', name: 'end_date' })
  endDate: string;

  @Column({
    type: 'enum',
    enum: Object.values(MealPlanStatus),
    default: MealPlanStatus.Active,
  })
  status: MealPlanStatus;

  @OneToMany(() => MealPlanItem, (item) => item.mealPlan, {
    cascade: ['insert'],
  })
  items: MealPlanItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
