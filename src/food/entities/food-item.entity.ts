import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum FoodSource {
  System = 'system', // seeded from USDA or other DB
  User = 'user', // user-contributed
}

@Entity('food_items')
export class FoodItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, name: 'serving_size' })
  servingSize: string; // e.g. "100", "1 cup"

  @Column({ type: 'varchar', length: 20, name: 'serving_unit' })
  servingUnit: string; // e.g. "g", "ml", "piece"

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  calories: number;

  @Column({ type: 'numeric', precision: 7, scale: 2, default: 0 })
  protein: number;

  @Column({ type: 'numeric', precision: 7, scale: 2, default: 0 })
  carbs: number;

  @Column({ type: 'numeric', precision: 7, scale: 2, default: 0 })
  fat: number;

  @Column({ type: 'numeric', precision: 7, scale: 2, default: 0 })
  fiber: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  category: string | null;

  @Column({
    type: 'enum',
    enum: Object.values(FoodSource),
    default: FoodSource.System,
  })
  source: FoodSource;

  @Column({ name: 'created_by', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
