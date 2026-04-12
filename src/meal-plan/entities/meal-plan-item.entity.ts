import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { FoodItem } from 'src/food/entities';
import { MealPlan } from './meal-plan.entity';

@Entity('meal_plan_items')
@Index(['mealPlanId', 'day', 'mealType'])
export class MealPlanItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'meal_plan_id' })
  mealPlanId: number;

  @ManyToOne(() => MealPlan, (plan) => plan.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meal_plan_id' })
  mealPlan: MealPlan;

  @Column({ type: 'integer' })
  day: number; // 1-7

  @Column({
    type: 'varchar',
    name: 'meal_type',
    length: 20,
  })
  mealType: string;

  @Column({ name: 'food_item_id' })
  foodItemId: number;

  @ManyToOne(() => FoodItem, { eager: true })
  @JoinColumn({ name: 'food_item_id' })
  foodItem: FoodItem;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  quantity: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  calories: number;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  protein: number;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  carbs: number;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  fat: number;
}
