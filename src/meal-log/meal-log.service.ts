import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MealLog } from './entities/meal-log.entity';
import { FoodService } from 'src/food/food.service';
import { CreateMealLogDto, QueryMealLogDto } from './dto';

@Injectable()
export class MealLogService {
  constructor(
    @InjectRepository(MealLog)
    private readonly mealLogRepo: Repository<MealLog>,
    private readonly foodService: FoodService,
  ) {}

  async create(userId: number, dto: CreateMealLogDto) {
    const foodItem = await this.foodService.findById(dto.foodItemId);

    const quantity = Number(dto.quantity);
    const log = this.mealLogRepo.create({
      userId,
      foodItemId: dto.foodItemId,
      quantity,
      mealType: dto.mealType,
      loggedAt: dto.loggedAt || new Date().toISOString().split('T')[0],
      // Snapshot: multiply food item nutrition by quantity
      calories: Number(foodItem.calories) * quantity,
      protein: Number(foodItem.protein) * quantity,
      carbs: Number(foodItem.carbs) * quantity,
      fat: Number(foodItem.fat) * quantity,
    });

    return this.mealLogRepo.save(log);
  }

  async getByDate(userId: number, dto: QueryMealLogDto) {
    const endDate = dto.endDate || dto.date;

    const logs = await this.mealLogRepo.find({
      where: {
        userId,
        loggedAt: Between(dto.date, endDate),
      },
      relations: ['foodItem'],
      order: { loggedAt: 'ASC', createdAt: 'ASC' },
    });

    return logs;
  }

  async getDailySummary(userId: number, date: string) {
    const logs = await this.mealLogRepo.find({
      where: { userId, loggedAt: date },
      relations: ['foodItem'],
    });

    const totals = logs.reduce(
      (acc, log) => ({
        calories: acc.calories + Number(log.calories),
        protein: acc.protein + Number(log.protein),
        carbs: acc.carbs + Number(log.carbs),
        fat: acc.fat + Number(log.fat),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    // Group by meal type
    const byMealType: Record<string, typeof logs> = {};
    for (const log of logs) {
      if (!byMealType[log.mealType]) {
        byMealType[log.mealType] = [];
      }
      byMealType[log.mealType].push(log);
    }

    return {
      date,
      totals: {
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein * 10) / 10,
        carbs: Math.round(totals.carbs * 10) / 10,
        fat: Math.round(totals.fat * 10) / 10,
      },
      meals: byMealType,
      logCount: logs.length,
    };
  }

  async delete(userId: number, logId: number) {
    const log = await this.mealLogRepo.findOne({
      where: { id: logId, userId },
    });
    if (!log) {
      throw new NotFoundException('Meal log not found');
    }
    await this.mealLogRepo.remove(log);
  }
}
