import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { FoodItem, FoodSource } from './entities/food-item.entity';
import { LlmService } from 'src/llm/llm.service';
import { CreateFoodItemDto, SearchFoodDto } from './dto';
import {
  buildNutritionEstimatePrompt,
  nutritionEstimateToolName,
  nutritionEstimateToolDescription,
  nutritionEstimateSchema,
  NutritionEstimateResult,
} from 'src/llm/prompts/nutrition-estimate.prompt';

@Injectable()
export class FoodService {
  private readonly logger = new Logger(FoodService.name);

  constructor(
    @InjectRepository(FoodItem)
    private readonly foodItemRepo: Repository<FoodItem>,
    private readonly llmService: LlmService,
  ) {}

  async search(dto: SearchFoodDto) {
    const where: Record<string, unknown> = {
      name: ILike(`%${dto.query}%`),
    };
    if (dto.category) {
      where.category = dto.category;
    }

    return this.foodItemRepo.find({
      where,
      take: dto.limit,
      order: { name: 'ASC' },
    });
  }

  /**
   * Search local DB first. If no match and LLM is available,
   * ask the LLM to estimate nutrition, cache the result, and return it.
   */
  async findByName(name: string): Promise<FoodItem | null> {
    const local = await this.foodItemRepo.findOne({
      where: { name: ILike(`%${name}%`) },
    });
    if (local) return local;

    // Fall back to LLM estimation
    if (!this.llmService.isAvailable) {
      return null;
    }

    try {
      const prompt = buildNutritionEstimatePrompt(name);
      const estimate =
        await this.llmService.chatJson<NutritionEstimateResult>({
          systemPrompt: prompt.system,
          userPrompt: prompt.user,
          toolName: nutritionEstimateToolName,
          toolDescription: nutritionEstimateToolDescription,
          inputSchema: nutritionEstimateSchema,
          temperature: 0.2,
        });

      const item = this.foodItemRepo.create({
        name: estimate.name,
        servingSize: estimate.servingSize,
        servingUnit: estimate.servingUnit,
        calories: estimate.calories,
        protein: estimate.protein,
        carbs: estimate.carbs,
        fat: estimate.fat,
        fiber: estimate.fiber,
        category: estimate.category,
        source: FoodSource.System,
      });

      return await this.foodItemRepo.save(item);
    } catch (error) {
      this.logger.warn(
        `LLM nutrition estimate failed for "${name}": ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  async findById(id: number) {
    return this.foodItemRepo.findOneByOrFail({ id });
  }

  async createUserFood(userId: number, dto: CreateFoodItemDto) {
    const item = this.foodItemRepo.create({
      ...dto,
      source: FoodSource.User,
      createdBy: userId,
    });
    return this.foodItemRepo.save(item);
  }

  async getCategories(): Promise<string[]> {
    const result = await this.foodItemRepo
      .createQueryBuilder('food')
      .select('DISTINCT food.category', 'category')
      .where('food.category IS NOT NULL')
      .orderBy('food.category', 'ASC')
      .getRawMany();

    return result.map((r) => r.category);
  }
}
