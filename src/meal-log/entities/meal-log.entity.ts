import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from 'src/user/entities';
import { FoodItem } from 'src/food/entities';

export enum MealType {
  Breakfast = 'breakfast',
  Lunch = 'lunch',
  Dinner = 'dinner',
  Snack = 'snack',
}

export enum LogSource {
  Manual = 'manual',
  AiParsed = 'ai_parsed',
  Plan = 'plan',
}

@Entity('meal_logs')
@Index(['userId', 'loggedAt'])
export class MealLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'food_item_id' })
  foodItemId: number;

  @ManyToOne(() => FoodItem, { eager: true })
  @JoinColumn({ name: 'food_item_id' })
  foodItem: FoodItem;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  quantity: number; // multiplier of the food item's serving size

  @Column({
    type: 'enum',
    name: 'meal_type',
    enum: Object.values(MealType),
  })
  mealType: MealType;

  @Column({
    type: 'enum',
    enum: Object.values(LogSource),
    default: LogSource.Manual,
  })
  source: LogSource;

  // Snapshot of nutrition at time of logging (denormalized for historical accuracy)
  @Column({ type: 'numeric', precision: 7, scale: 2 })
  calories: number;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  protein: number;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  carbs: number;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  fat: number;

  @Column({ type: 'date', name: 'logged_at' })
  loggedAt: string; // YYYY-MM-DD

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
