import { Injectable, NotFoundException } from '@nestjs/common';
import { MealLogService } from 'src/meal-log/meal-log.service';
import { UserService } from 'src/user/user.service';
import { MealPlanService } from 'src/meal-plan/meal-plan.service';
import { AdaptiveService } from 'src/adaptive/adaptive.service';
import { LlmService, LlmModel } from 'src/llm/llm.service';
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
    private readonly adaptiveService: AdaptiveService,
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

    const goal = profile.dietaryGoal || 'maintain';
    const macroTargets = this.computeMacroTargets(target, goal);

    // Outcome score: how well the user hits calorie/macro targets (independent of plan)
    const outcomeScore = this.computeAdherenceScore(
      consumed, target,
      summary.totals, macroTargets,
    );

    // Strictness from last 7 days of outcome history
    // Strictness from AdaptiveProfile (computed weekly via pressure score)
    const adaptiveProfileEntity = await this.adaptiveService.getCurrent(userId);
    const strictness = adaptiveProfileEntity?.strictnessLevel || 'moderate';

    // If active meal plan exists, get today's planned meals + slot-based adherence
    let plannedMeals: any[] | null = null;
    let planAdherence: number | null = null;

    try {
      const plan = await this.mealPlanService.getActive(userId);
      const planStart = new Date(plan.startDate);
      const targetDate = new Date(date);
      const diffDays = Math.floor(
        (targetDate.getTime() - planStart.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

      if (diffDays >= 1 && diffDays <= 7) {
        const dayItems = plan.items.filter((item) => item.day === diffDays);
        plannedMeals = dayItems;

        planAdherence = this.computeSlotAdherence(dayItems, summary.meals);
      }
    } catch {
      // No active plan — that's fine
    }

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
      macroTargets,
      outcomeScore: Math.round(outcomeScore * 100) / 100,
      planAdherence: planAdherence !== null ? Math.round(planAdherence * 100) / 100 : null,
      strictness,
      quadrant: adaptiveProfileEntity?.quadrant || null,
      planMode: adaptiveProfileEntity?.planMode || null,
      pressureScore: adaptiveProfileEntity ? Number(adaptiveProfileEntity.pressureScore) : null,
      plannedMeals,
      meals: summary.meals,
      logCount: summary.logCount,
      mealCount: summary.mealCount,
    };
  }

  /**
   * Slot-based plan adherence.
   *
   * Groups planned items by recipe (recipeName + mealType).
   * For each planned recipe slot:
   *   - Logged the exact planned foods in that meal type → 1.0
   *   - Logged different foods in that meal type         → 0.5
   *   - Nothing logged for that meal type                → 0.0
   *
   * Returns average across all planned slots (0–1).
   */
  private computeSlotAdherence(
    plannedItems: any[],
    actualMeals: Record<string, any[]>,
  ): number | null {
    // Group planned items into slots by recipeName + mealType
    const plannedSlots = new Map<string, { mealType: string; foodItemIds: Set<number> }>();
    for (const item of plannedItems) {
      const key = `${item.mealType}::${item.recipeName || item.foodItemId}`;
      if (!plannedSlots.has(key)) {
        plannedSlots.set(key, { mealType: item.mealType, foodItemIds: new Set() });
      }
      plannedSlots.get(key)!.foodItemIds.add(item.foodItemId);
    }

    if (plannedSlots.size === 0) return null;

    let totalScore = 0;

    for (const [, slot] of plannedSlots) {
      const loggedInSlot = actualMeals[slot.mealType] || [];

      if (loggedInSlot.length === 0) {
        // Skipped the slot entirely → 0.0
        totalScore += 0;
        continue;
      }

      // Check if any of the planned food IDs were logged
      const loggedFoodIds = new Set(loggedInSlot.map((log: any) => log.foodItemId));
      const matchCount = [...slot.foodItemIds].filter(id => loggedFoodIds.has(id)).length;

      if (matchCount > 0) {
        // Logged the planned meal (at least partially) → 1.0
        totalScore += 1.0;
      } else {
        // Logged a different meal in that slot → 0.5
        totalScore += 0.5;
      }
    }

    return Math.round((totalScore / plannedSlots.size) * 100) / 100;
  }

  private computeMacroTargets(calories: number, goal: string) {
    let pRatio = 0.3, cRatio = 0.4, fRatio = 0.3;
    if (goal === 'gain') { pRatio = 0.25; cRatio = 0.55; fRatio = 0.2; }
    else if (goal === 'lose') { pRatio = 0.4; cRatio = 0.3; fRatio = 0.3; }
    return {
      protein: Math.round((calories * pRatio) / 4),
      carbs: Math.round((calories * cRatio) / 4),
      fat: Math.round((calories * fRatio) / 9),
    };
  }

  private computeAdherenceScore(
    consumedCals: number, targetCals: number,
    consumed: { protein: number; carbs: number; fat: number },
    targets: { protein: number; carbs: number; fat: number },
  ): number {
    if (targetCals <= 0) return 0;

    const ratio = (c: number, t: number) =>
      t > 0 ? Math.max(0, Math.min(1, 1 - Math.abs(c - t) / t)) : 1;

    return (
      ratio(consumedCals, targetCals) * 0.5 +
      ratio(consumed.protein, targets.protein) * 0.2 +
      ratio(consumed.carbs, targets.carbs) * 0.15 +
      ratio(consumed.fat, targets.fat) * 0.15
    );
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

    // Fetch adaptive profile for tone modulation
    const adaptiveEntity = await this.adaptiveService.getCurrent(userId);
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

    const prompt = buildWeeklyFeedbackPrompt({
      dietaryGoal: profile.dietaryGoal || 'maintain',
      targetCalories: Number(profile.targetCalories) || 0,
      dietaryLifestyle: profile.dietaryLifestyle,
      currentWeight: profile.currentWeight ? Number(profile.currentWeight) : null,
      days: weeklyOverview.days,
      summary: weeklyOverview.summary,
      adherenceScores,
      adaptiveProfile,
    });

    const feedback = await this.llmService.chatJson<WeeklyFeedbackResult>({
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      toolName: weeklyFeedbackToolName,
      toolDescription: weeklyFeedbackToolDescription,
      inputSchema: weeklyFeedbackSchema,
      model: LlmModel.Feedback,
      temperature: 0.7,
    });

    return {
      feedback,
      weeklyOverview,
      adherenceScores,
    };
  }
}
