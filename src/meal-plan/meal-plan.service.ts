import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MealPlan, MealPlanStatus } from './entities/meal-plan.entity';
import { MealPlanItem } from './entities/meal-plan-item.entity';
import { UserService } from 'src/user/user.service';
import { FoodService } from 'src/food/food.service';
import { LlmService } from 'src/llm/llm.service';
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

    // Fetch a compact set of foods for LLM context (limit to avoid token overflow)
    const foods = await this.foodService.search({ query: '', limit: 30 });
    const availableFoods = foods.map((f) => ({
      id: f.id,
      name: f.name,
      calories: Number(f.calories),
      category: f.category,
    }));

    const prompt = buildMealPlanPrompt({
      targetCalories: Number(profile.targetCalories),
      mealsPerDay: profile.mealsPerDay,
      dietaryLifestyle: profile.dietaryLifestyle,
      allergies: profile.allergies,
      restrictions: profile.restrictions,
      dislikes: profile.dislikes,
      budgetPerDay: profile.budgetPerDay ? Number(profile.budgetPerDay) : null,
      availableFoods,
    });

    const result = await this.llmService.chatJson<MealPlanLlmResult>({
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      toolName: mealPlanToolName,
      toolDescription: mealPlanToolDescription,
      inputSchema: mealPlanSchema,
      temperature: 0.7,
      maxTokens: 4096,
    });

    // Resolve food items and build plan items
    const startDate =
      dto.startDate || new Date().toISOString().split('T')[0];
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const items: Partial<MealPlanItem>[] = [];

    for (const day of result.days) {
      for (const meal of day.meals) {
        let foodItemId: number;
        let calories: number;
        let protein: number;
        let carbs: number;
        let fat: number;

        if (meal.foodItemId) {
          // Verify the food item exists
          try {
            const existing = await this.foodService.findById(meal.foodItemId);
            foodItemId = existing.id;
            calories = Number(existing.calories) * meal.quantity;
            protein = Number(existing.protein) * meal.quantity;
            carbs = Number(existing.carbs) * meal.quantity;
            fat = Number(existing.fat) * meal.quantity;
          } catch {
            // LLM hallucinated an ID — create as new food
            const newFood = await this.foodService.createUserFood(userId, {
              name: meal.foodName,
              servingSize: meal.servingSize,
              servingUnit: meal.servingUnit,
              calories: meal.estimatedCalories,
              protein: meal.estimatedProtein,
              carbs: meal.estimatedCarbs,
              fat: meal.estimatedFat,
            });
            foodItemId = newFood.id;
            calories = meal.estimatedCalories * meal.quantity;
            protein = meal.estimatedProtein * meal.quantity;
            carbs = meal.estimatedCarbs * meal.quantity;
            fat = meal.estimatedFat * meal.quantity;
          }
        } else {
          // New food suggested by LLM
          const newFood = await this.foodService.createUserFood(userId, {
            name: meal.foodName,
            servingSize: meal.servingSize,
            servingUnit: meal.servingUnit,
            calories: meal.estimatedCalories,
            protein: meal.estimatedProtein,
            carbs: meal.estimatedCarbs,
            fat: meal.estimatedFat,
          });
          foodItemId = newFood.id;
          calories = meal.estimatedCalories * meal.quantity;
          protein = meal.estimatedProtein * meal.quantity;
          carbs = meal.estimatedCarbs * meal.quantity;
          fat = meal.estimatedFat * meal.quantity;
        }

        items.push({
          day: day.day,
          mealType: meal.mealType,
          foodItemId,
          quantity: meal.quantity,
          notes: meal.notes,
          calories,
          protein,
          carbs,
          fat,
        });
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
}
