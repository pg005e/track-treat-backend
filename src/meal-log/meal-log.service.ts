import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MealLog, LogSource } from './entities/meal-log.entity';
import { FoodService } from 'src/food/food.service';
import { LlmService } from 'src/llm/llm.service';
import { CreateMealLogDto, QueryMealLogDto, ParseTextDto } from './dto';
import { parseFoodText } from 'src/food/food-text-parser';
import {
  buildFoodParsingPrompt,
  foodParsingToolName,
  foodParsingToolDescription,
  foodParsingSchema,
  FoodParsingResult,
} from 'src/llm/prompts/food-parsing.prompt';

@Injectable()
export class MealLogService {
  private readonly logger = new Logger(MealLogService.name);

  constructor(
    @InjectRepository(MealLog)
    private readonly mealLogRepo: Repository<MealLog>,
    private readonly foodService: FoodService,
    private readonly llmService: LlmService,
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
    const loggedAt = dto.loggedAt || new Date().toISOString().split('T')[0];

    // Try LLM-based parsing first (decomposes composite dishes into ingredients)
    if (this.llmService.isAvailable) {
      return this.parseTextWithLlm(userId, dto.text, dto.mealType, loggedAt);
    }

    // Fallback: local regex parser + DB lookup
    return this.parseTextWithRegex(userId, dto.text, dto.mealType, loggedAt);
  }

  private async parseTextWithLlm(
    userId: number,
    text: string,
    mealType: string,
    loggedAt: string,
  ) {
    const prompt = buildFoodParsingPrompt(text);
    let result: FoodParsingResult;

    try {
      result = await this.llmService.chatJson<FoodParsingResult>({
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        toolName: foodParsingToolName,
        toolDescription: foodParsingToolDescription,
        inputSchema: foodParsingSchema,
        temperature: 0.2,
      });
    } catch (error) {
      this.logger.warn(
        `LLM food parsing failed, falling back to regex: ${error instanceof Error ? error.message : error}`,
      );
      return this.parseTextWithRegex(userId, text, mealType, loggedAt);
    }

    if (!result.items || result.items.length === 0) {
      throw new BadRequestException(
        'Could not extract any food items. Try something like "2 eggs and a bowl of rice".',
      );
    }

    const logs: MealLog[] = [];

    for (const item of result.items) {
      // Find or create FoodItem for each ingredient
      let foodItem = await this.foodService.findByName(item.name);

      if (!foodItem) {
        // Create from LLM-estimated nutrition
        foodItem = await this.foodService.createUserFood(userId, {
          name: item.name,
          servingSize: item.servingSize,
          servingUnit: item.servingUnit,
          calories: item.estimatedCalories,
          protein: item.estimatedProtein,
          carbs: item.estimatedCarbs,
          fat: item.estimatedFat,
        });
      }

      const log = await this.create(
        userId,
        {
          foodItemId: foodItem.id,
          quantity: Math.round(item.quantity * 100) / 100,
          mealType: mealType as any,
          loggedAt,
        },
        LogSource.AiParsed,
      );
      logs.push(log);
    }

    return { logged: logs, unresolved: null };
  }

  private async parseTextWithRegex(
    userId: number,
    text: string,
    mealType: string,
    loggedAt: string,
  ) {
    const parsed = parseFoodText(text);

    if (parsed.length === 0) {
      throw new BadRequestException(
        'Could not extract any food items. Try something like "2 eggs and a bowl of rice".',
      );
    }

    const logs: MealLog[] = [];
    const unresolved: string[] = [];

    for (const item of parsed) {
      const foodItem = await this.foodService.findByName(item.name);

      if (!foodItem) {
        unresolved.push(item.name);
        continue;
      }

      let quantity = item.quantity;
      if (item.unit === 'g' && foodItem.servingUnit === 'g') {
        quantity = item.quantity / (parseFloat(foodItem.servingSize) || 100);
      } else if (item.unit === 'kg') {
        quantity = (item.quantity * 1000) / (parseFloat(foodItem.servingSize) || 100);
      } else if (item.unit === 'ml' && foodItem.servingUnit === 'ml') {
        quantity = item.quantity / (parseFloat(foodItem.servingSize) || 100);
      }

      const log = await this.create(
        userId,
        {
          foodItemId: foodItem.id,
          quantity: Math.round(quantity * 100) / 100,
          mealType: mealType as any,
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
