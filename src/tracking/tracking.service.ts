import { Injectable, NotFoundException } from '@nestjs/common';
import { MealLogService } from 'src/meal-log/meal-log.service';
import { UserService } from 'src/user/user.service';
import { MealPlanService } from 'src/meal-plan/meal-plan.service';
import { LlmService } from 'src/llm/llm.service';
import {
  buildWeeklyFeedbackPrompt,
  weeklyFeedbackToolName,
  weeklyFeedbackToolDescription,
  weeklyFeedbackSchema,
  WeeklyFeedbackResult,
} from 'src/llm/prompts/weekly-feedback.prompt';

@Injectable()
export class TrackingService {
  constructor(
    private readonly mealLogService: MealLogService,
    private readonly userService: UserService,
    private readonly mealPlanService: MealPlanService,
    private readonly llmService: LlmService,
  ) {}

  async getDailyProgress(userId: number, date: string) {
    const [profile, summary] = await Promise.all([
      this.userService.getProfile(userId),
      this.mealLogService.getDailySummary(userId, date),
    ]);

    const target = Number(profile.targetCalories) || 0;
    const consumed = summary.totals.calories;
    const remaining = Math.max(0, target - consumed);
    const percentage = target > 0 ? Math.round((consumed / target) * 100) : 0;

    return {
      date,
      target,
      consumed,
      remaining,
      percentage,
      macros: {
        protein: summary.totals.protein,
        carbs: summary.totals.carbs,
        fat: summary.totals.fat,
      },
      meals: summary.meals,
      logCount: summary.logCount,
    };
  }

  async getWeeklyOverview(userId: number, startDate: string) {
    const profile = await this.userService.getProfile(userId);
    const target = Number(profile.targetCalories) || 0;
    const days: Array<{
      date: string;
      consumed: number;
      target: number;
      delta: number;
    }> = [];

    const start = new Date(startDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const summary = await this.mealLogService.getDailySummary(
        userId,
        dateStr,
      );
      days.push({
        date: dateStr,
        consumed: summary.totals.calories,
        target,
        delta: summary.totals.calories - target,
      });
    }

    const totalConsumed = days.reduce((sum, d) => sum + d.consumed, 0);
    const avgDaily = Math.round(totalConsumed / 7);
    const daysOnTrack = days.filter(
      (d) => d.consumed > 0 && Math.abs(d.delta) <= target * 0.1,
    ).length;

    return {
      startDate,
      days,
      summary: {
        totalConsumed,
        avgDaily,
        weeklyTarget: target * 7,
        daysOnTrack,
        daysLogged: days.filter((d) => d.consumed > 0).length,
      },
    };
  }

  async getAdherence(userId: number, date: string) {
    let plan;
    try {
      plan = await this.mealPlanService.getActive(userId);
    } catch {
      throw new NotFoundException('No active meal plan to compare against');
    }

    // Determine which day (1-7) the date falls on
    const planStart = new Date(plan.startDate);
    const targetDate = new Date(date);
    const diffDays =
      Math.floor(
        (targetDate.getTime() - planStart.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    if (diffDays < 1 || diffDays > 7) {
      throw new NotFoundException(
        'Date falls outside the active meal plan period',
      );
    }

    const plannedItems = plan.items.filter((item) => item.day === diffDays);
    const summary = await this.mealLogService.getDailySummary(userId, date);

    const plannedCalories = plannedItems.reduce(
      (sum, item) => sum + Number(item.calories),
      0,
    );
    const actualCalories = summary.totals.calories;

    // Calorie adherence (50% weight)
    const calorieScore =
      plannedCalories > 0
        ? Math.max(
            0,
            1 - Math.abs(actualCalories - plannedCalories) / plannedCalories,
          ) * 100
        : 0;

    // Meal type coverage (30% weight)
    const plannedMealTypes = Array.from(
      new Set<string>(plannedItems.map((item) => item.mealType)),
    );
    const loggedMealTypes = Object.keys(summary.meals);
    const coveredMealTypes = plannedMealTypes.filter((mt: string) =>
      loggedMealTypes.includes(mt),
    );
    const mealCoverageScore =
      plannedMealTypes.length > 0
        ? (coveredMealTypes.length / plannedMealTypes.length) * 100
        : 0;

    // Food item match (20% weight)
    const plannedFoodIds = plannedItems.map((item) => item.foodItemId);
    const loggedFoodIds = Object.values(summary.meals)
      .flat()
      .map((log: any) => log.foodItemId);
    const matchedFoods = plannedFoodIds.filter((id) =>
      loggedFoodIds.includes(id),
    );
    const foodMatchScore =
      plannedFoodIds.length > 0
        ? (matchedFoods.length / plannedFoodIds.length) * 100
        : 0;

    const score = Math.round(
      calorieScore * 0.5 + mealCoverageScore * 0.3 + foodMatchScore * 0.2,
    );

    return {
      date,
      dayNumber: diffDays,
      score,
      planned: {
        totalCalories: Math.round(plannedCalories),
        items: plannedItems,
      },
      actual: {
        totalCalories: actualCalories,
        meals: summary.meals,
      },
      breakdown: {
        calorieScore: Math.round(calorieScore),
        mealCoverageScore: Math.round(mealCoverageScore),
        foodMatchScore: Math.round(foodMatchScore),
      },
    };
  }

  async getWeeklyFeedback(userId: number, startDate?: string) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const effectiveStart =
      startDate || monday.toISOString().split('T')[0];

    const [profile, weeklyOverview] = await Promise.all([
      this.userService.getProfile(userId),
      this.getWeeklyOverview(userId, effectiveStart),
    ]);

    // Optionally gather adherence scores if an active plan exists
    let adherenceScores: number[] | undefined;
    try {
      const plan = await this.mealPlanService.getActive(userId);
      adherenceScores = [];
      for (const day of weeklyOverview.days) {
        try {
          const adherence = await this.getAdherence(userId, day.date);
          adherenceScores.push(adherence.score);
        } catch {
          // Day outside plan range — skip
        }
      }
      if (adherenceScores.length === 0) adherenceScores = undefined;
    } catch {
      // No active plan — skip adherence
    }

    const prompt = buildWeeklyFeedbackPrompt({
      dietaryGoal: profile.dietaryGoal || 'maintain',
      targetCalories: Number(profile.targetCalories) || 0,
      dietaryLifestyle: profile.dietaryLifestyle,
      currentWeight: profile.currentWeight ? Number(profile.currentWeight) : null,
      days: weeklyOverview.days,
      summary: weeklyOverview.summary,
      adherenceScores,
    });

    const feedback = await this.llmService.chatJson<WeeklyFeedbackResult>({
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      toolName: weeklyFeedbackToolName,
      toolDescription: weeklyFeedbackToolDescription,
      inputSchema: weeklyFeedbackSchema,
      temperature: 0.7,
    });

    return {
      feedback,
      weeklyOverview,
      adherenceScores,
    };
  }
}
