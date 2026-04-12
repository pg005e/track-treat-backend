import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MealLog, LogSource } from './entities/meal-log.entity';
import { FoodService } from 'src/food/food.service';
import { CreateMealLogDto, QueryMealLogDto, ParseTextDto } from './dto';
import { parseFoodText } from 'src/food/food-text-parser';

@Injectable()
export class MealLogService {
  constructor(
    @InjectRepository(MealLog)
    private readonly mealLogRepo: Repository<MealLog>,
    private readonly foodService: FoodService,
  ) {}

  async create(
    userId: number,
    dto: CreateMealLogDto,
    source: LogSource = LogSource.Manual,
  ) {
    const foodItem = await this.foodService.findById(dto.foodItemId);

    const quantity = Number(dto.quantity);
    const log = this.mealLogRepo.create({
      userId,
      foodItemId: dto.foodItemId,
      quantity,
      mealType: dto.mealType,
      source,
      loggedAt: dto.loggedAt || new Date().toISOString().split('T')[0],
      calories: Number(foodItem.calories) * quantity,
      protein: Number(foodItem.protein) * quantity,
      carbs: Number(foodItem.carbs) * quantity,
      fat: Number(foodItem.fat) * quantity,
    });

    return this.mealLogRepo.save(log);
  }

  async parseText(userId: number, dto: ParseTextDto) {
    const parsed = parseFoodText(dto.text);

    if (parsed.length === 0) {
      throw new BadRequestException(
        'Could not extract any food items from the text. Try something like "2 eggs and a bowl of rice".',
      );
    }

    const logs: MealLog[] = [];
    const unresolved: string[] = [];
    const loggedAt = dto.loggedAt || new Date().toISOString().split('T')[0];

    for (const item of parsed) {
      // Search local DB + USDA fallback
      const foodItem = await this.foodService.findByName(item.name);

      if (!foodItem) {
        unresolved.push(item.name);
        continue;
      }

      // Determine quantity multiplier
      // If user specified a weight unit (e.g. "300g") and food serving is in "g",
      // calculate the multiplier
      let quantity = item.quantity;
      if (item.unit === 'g' && foodItem.servingUnit === 'g') {
        const servingGrams = parseFloat(foodItem.servingSize) || 100;
        quantity = item.quantity / servingGrams;
      } else if (item.unit === 'kg') {
        const servingGrams = parseFloat(foodItem.servingSize) || 100;
        quantity = (item.quantity * 1000) / servingGrams;
      } else if (item.unit === 'ml' && foodItem.servingUnit === 'ml') {
        const servingMl = parseFloat(foodItem.servingSize) || 100;
        quantity = item.quantity / servingMl;
      }
      // For non-weight units (bowl, plate, piece, cup) or no unit,
      // use quantity as-is (it's a serving multiplier)

      const log = await this.create(
        userId,
        {
          foodItemId: foodItem.id,
          quantity: Math.round(quantity * 100) / 100,
          mealType: dto.mealType,
          loggedAt,
        },
        LogSource.AiParsed,
      );
      logs.push(log);
    }

    return {
      logged: logs,
      unresolved:
        unresolved.length > 0
          ? {
              items: unresolved,
              message: `Could not find these items: ${unresolved.join(', ')}. You can add them manually.`,
            }
          : null,
    };
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
