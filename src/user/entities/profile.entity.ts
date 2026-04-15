import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum BiologicalSex {
  Male = 'male',
  Female = 'female',
  Other = 'other',
}

export enum ActivityLevel {
  Sedentary = 'sedentary',
  LightlyActive = 'lightly_active',
  ModeratelyActive = 'moderately_active',
  VeryActive = 'very_active',
  ExtraActive = 'extra_active',
}

export enum DietaryGoal {
  Lose = 'lose',
  Maintain = 'maintain',
  Gain = 'gain',
}

export enum DietaryLifestyle {
  None = 'none',
  Vegetarian = 'vegetarian',
  Vegan = 'vegan',
  Pescatarian = 'pescatarian',
  Keto = 'keto',
  Paleo = 'paleo',
}

@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', name: 'user_id', unique: true })
  userId: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', name: 'avatar_url', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @Column({ type: 'date', name: 'birth_date', nullable: true })
  birthDate: Date | null;

  @Column({
    type: 'enum',
    name: 'biological_sex',
    enum: Object.values(BiologicalSex),
    nullable: true,
  })
  biologicalSex: BiologicalSex | null;

  @Column({
    type: 'numeric',
    name: 'height_cm',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  heightCm: number | null;

  @Column({
    type: 'numeric',
    name: 'initial_weight',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  initialWeight: number | null;

  @Column({
    type: 'numeric',
    name: 'current_weight',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  currentWeight: number | null;

  @Column({
    type: 'enum',
    name: 'activity_level',
    enum: Object.values(ActivityLevel),
    nullable: true,
  })
  activityLevel: ActivityLevel | null;

  @Column({
    type: 'enum',
    name: 'dietary_goal',
    enum: Object.values(DietaryGoal),
    nullable: true,
  })
  dietaryGoal: DietaryGoal | null;

  @Column({
    type: 'enum',
    name: 'dietary_lifestyle',
    enum: Object.values(DietaryLifestyle),
    default: DietaryLifestyle.None,
  })
  dietaryLifestyle: DietaryLifestyle;

  @Column({ type: 'text', array: true, default: '{}' })
  allergies: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  restrictions: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  dislikes: string[];

  @Column({
    type: 'integer',
    name: 'meals_per_day',
    default: 3,
  })
  mealsPerDay: number;

  @Column({ name: 'meals_per_day_auto', default: false })
  mealsPerDayAuto: boolean;

  @Column({
    type: 'numeric',
    name: 'budget_per_day',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  budgetPerDay: number | null;

  @Column({
    type: 'numeric',
    name: 'target_calories',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  targetCalories: number | null;

  @Column({
    type: 'numeric',
    name: 'daily_water_target',
    precision: 7,
    scale: 2,
    default: 2500,
  })
  dailyWaterTarget: number;

  @Column({ name: 'onboarding_completed', default: false })
  onboardingCompleted: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
