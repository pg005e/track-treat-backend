import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MealPlan, MealPlanStatus } from './entities/meal-plan.entity';
import { MealPlanItem } from './entities/meal-plan-item.entity';
import { AdaptiveProfileEntity } from 'src/adaptive/entities';
import { UserService } from 'src/user/user.service';
import { FoodService } from 'src/food/food.service';
import { LlmService, LlmModel } from 'src/llm/llm.service';
import { GeneratePlanDto } from './dto';
import {
  buildMealPlanPrompt,
  mealPlanToolName,
  mealPlanToolDescription,
  mealPlanSchema,
  MealPlanLlmResult,
} from 'src/llm/prompts/meal-plan.prompt';

@Injectable()
export class MealPlanService {
  constructor(
    @InjectRepository(MealPlan)
    private readonly planRepo: Repository<MealPlan>,
    @InjectRepository(MealPlanItem)
    private readonly itemRepo: Repository<MealPlanItem>,
    @InjectRepository(AdaptiveProfileEntity)
    private readonly adaptiveRepo: Repository<AdaptiveProfileEntity>,
    private readonly userService: UserService,
    private readonly foodService: FoodService,
    private readonly llmService: LlmService,
  ) {}

  async generate(userId: number, dto: GeneratePlanDto) {
    const profile = await this.userService.getProfile(userId);

    if (!profile.onboardingCompleted) {
      throw new BadRequestException(
        'Complete your profile onboarding before generating a meal plan',
      );
    }

    // Cancel any existing active plan
    await this.planRepo.update(
      { userId, status: MealPlanStatus.Active },
      { status: MealPlanStatus.Cancelled },
    );

    // Fetch latest adaptive profile (if exists)
    const adaptiveEntity = await this.adaptiveRepo.findOne({
      where: { userId },
      order: { weekStartDate: 'DESC' },
    });

    // Handle recalibration: recompute TDEE before generating
    if (adaptiveEntity?.recalibrateFlag) {
      const tdee = this.userService.calculateTdee(profile);
      if (tdee) {
        const recalibrated = this.userService.calculateTargetFromTdee(tdee, profile.dietaryGoal);
        profile.targetCalories = recalibrated;
      }
    }

    // Fetch foods, filtering out skipped foods from adaptive profile
    const skippedIds = new Set(adaptiveEntity?.skippedFoods || []);
    const foods = await this.foodService.search({ query: '', limit: 30 });
    const availableFoods = foods
      .filter((f) => !skippedIds.has(f.id))
      .map((f) => ({
        id: f.id,
        name: f.name,
        calories: Number(f.calories),
        protein: Number(f.protein),
        carbs: Number(f.carbs),
        fat: Number(f.fat),
        category: f.category,
      }));

    // Convert entity to AdaptiveProfile interface for the prompt
    const adaptiveProfile = adaptiveEntity ? {
      quadrant: adaptiveEntity.quadrant as any,
      strictnessLevel: adaptiveEntity.strictnessLevel as any,
      planMode: adaptiveEntity.planMode as any,
      pressureScore: Number(adaptiveEntity.pressureScore),
      complexityTarget: adaptiveEntity.complexityTarget,
      simplifyFlag: adaptiveEntity.simplifyFlag,
      recalibrateFlag: adaptiveEntity.recalibrateFlag,
      adherenceScore: Number(adaptiveEntity.adherenceScore),
      outcomeScore: Number(adaptiveEntity.outcomeScore),
      weekStreak: adaptiveEntity.weekStreak,
      weekNumber: adaptiveEntity.weekNumber,
      skippedFoods: adaptiveEntity.skippedFoods,
      preferredFoods: adaptiveEntity.preferredFoods,
      slotAdherence: adaptiveEntity.slotAdherence,
      userId: adaptiveEntity.userId,
      weekStartDate: adaptiveEntity.weekStartDate,
      computedAt: adaptiveEntity.computedAt.toISOString(),
    } : null;

    const prompt = buildMealPlanPrompt({
      targetCalories: Number(profile.targetCalories),
      mealsPerDay: profile.mealsPerDay,
      dietaryLifestyle: profile.dietaryLifestyle,
      region: profile.region,
      allergies: profile.allergies,
      restrictions: profile.restrictions,
      dislikes: profile.dislikes,
      budgetPerDay: profile.budgetPerDay ? Number(profile.budgetPerDay) : null,
      availableFoods,
      adaptiveProfile,
    });

    const result = await this.llmService.chatJson<MealPlanLlmResult>({
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      toolName: mealPlanToolName,
      toolDescription: mealPlanToolDescription,
      inputSchema: mealPlanSchema,
      model: LlmModel.MealPlan,
      temperature: 0.6,
      maxTokens: 8192,
    });

    // Resolve food items and build plan items
    const startDate =
      dto.startDate || new Date().toISOString().split('T')[0];
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const items: Partial<MealPlanItem>[] = [];

    for (const day of result.days) {
      for (const recipe of day.recipes) {
        for (const ing of recipe.ingredients) {
          const resolved = await this.resolveIngredient(userId, ing);

          items.push({
            day: day.day,
            mealType: recipe.mealType,
            recipeName: recipe.recipeName,
            prepNotes: recipe.prepNotes,
            foodItemId: resolved.foodItemId,
            quantity: ing.quantity,
            notes: null,
            calories: resolved.calories * ing.quantity,
            protein: resolved.protein * ing.quantity,
            carbs: resolved.carbs * ing.quantity,
            fat: resolved.fat * ing.quantity,
          });
        }
      }
    }

    const plan = this.planRepo.create({
      userId,
      startDate,
      endDate: endDate.toISOString().split('T')[0],
      status: MealPlanStatus.Active,
      items: items as MealPlanItem[],
    });

    const saved = await this.planRepo.save(plan);

    return this.getById(userId, saved.id);
  }

  async getActive(userId: number) {
    const plan = await this.planRepo.findOne({
      where: { userId, status: MealPlanStatus.Active },
      relations: ['items', 'items.foodItem'],
      order: { createdAt: 'DESC' },
    });

    if (!plan) {
      throw new NotFoundException('No active meal plan found');
    }

    // Sort items by day and meal type
    plan.items.sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      const order = ['breakfast', 'snack', 'lunch', 'dinner'];
      return order.indexOf(a.mealType) - order.indexOf(b.mealType);
    });

    return plan;
  }

  async getById(userId: number, planId: number) {
    const plan = await this.planRepo.findOne({
      where: { id: planId, userId },
      relations: ['items', 'items.foodItem'],
    });

    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }

    plan.items.sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      const order = ['breakfast', 'snack', 'lunch', 'dinner'];
      return order.indexOf(a.mealType) - order.indexOf(b.mealType);
    });

    return plan;
  }

  async cancel(userId: number, planId: number) {
    const plan = await this.planRepo.findOne({
      where: { id: planId, userId, status: MealPlanStatus.Active },
    });

    if (!plan) {
      throw new NotFoundException('Active meal plan not found');
    }

    plan.status = MealPlanStatus.Cancelled;
    await this.planRepo.save(plan);
  }

  async updateItem(
    userId: number,
    planId: number,
    itemId: number,
    dto: { foodItemId?: number; quantity?: number; notes?: string | null },
  ) {
    const item = await this.getOwnedItem(userId, planId, itemId);

    if (dto.foodItemId !== undefined) {
      const food = await this.foodService.findById(dto.foodItemId);
      item.foodItemId = food.id;
      const qty = dto.quantity ?? Number(item.quantity);
      item.calories = Number(food.calories) * qty;
      item.protein = Number(food.protein) * qty;
      item.carbs = Number(food.carbs) * qty;
      item.fat = Number(food.fat) * qty;
      if (dto.quantity !== undefined) item.quantity = dto.quantity;
    } else if (dto.quantity !== undefined) {
      const food = await this.foodService.findById(item.foodItemId);
      item.quantity = dto.quantity;
      item.calories = Number(food.calories) * dto.quantity;
      item.protein = Number(food.protein) * dto.quantity;
      item.carbs = Number(food.carbs) * dto.quantity;
      item.fat = Number(food.fat) * dto.quantity;
    }

    if (dto.notes !== undefined) item.notes = dto.notes;

    return this.itemRepo.save(item);
  }

  async deleteItem(userId: number, planId: number, itemId: number) {
    const item = await this.getOwnedItem(userId, planId, itemId);
    await this.itemRepo.remove(item);
  }

  async addItem(
    userId: number,
    planId: number,
    dto: { day: number; mealType: string; foodItemId: number; quantity: number; notes?: string | null },
  ) {
    // Verify plan ownership
    const plan = await this.planRepo.findOne({
      where: { id: planId, userId, status: MealPlanStatus.Active },
    });
    if (!plan) throw new NotFoundException('Active meal plan not found');

    const food = await this.foodService.findById(dto.foodItemId);

    const item = this.itemRepo.create({
      mealPlanId: planId,
      day: dto.day,
      mealType: dto.mealType,
      foodItemId: food.id,
      quantity: dto.quantity,
      notes: dto.notes || null,
      calories: Number(food.calories) * dto.quantity,
      protein: Number(food.protein) * dto.quantity,
      carbs: Number(food.carbs) * dto.quantity,
      fat: Number(food.fat) * dto.quantity,
    });

    return this.itemRepo.save(item);
  }

  private async resolveIngredient(
    userId: number,
    ing: { foodItemId: number | null; foodName: string; servingSize: string; servingUnit: string; estimatedCalories: number; estimatedProtein: number; estimatedCarbs: number; estimatedFat: number },
  ) {
    if (ing.foodItemId) {
      try {
        const existing = await this.foodService.findById(ing.foodItemId);
        return { foodItemId: existing.id, calories: Number(existing.calories), protein: Number(existing.protein), carbs: Number(existing.carbs), fat: Number(existing.fat) };
      } catch {
        // LLM hallucinated an ID — create as new
      }
    }

    const newFood = await this.foodService.createUserFood(userId, {
      name: ing.foodName,
      servingSize: ing.servingSize,
      servingUnit: ing.servingUnit,
      calories: ing.estimatedCalories,
      protein: ing.estimatedProtein,
      carbs: ing.estimatedCarbs,
      fat: ing.estimatedFat,
    });
    return { foodItemId: newFood.id, calories: ing.estimatedCalories, protein: ing.estimatedProtein, carbs: ing.estimatedCarbs, fat: ing.estimatedFat };
  }

  private async getOwnedItem(userId: number, planId: number, itemId: number) {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, mealPlanId: planId },
      relations: ['mealPlan'],
    });

    if (!item || item.mealPlan.userId !== userId) {
      throw new NotFoundException('Plan item not found');
    }

    return item;
  }
}
