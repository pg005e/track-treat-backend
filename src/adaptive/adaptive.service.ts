import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdaptiveProfileEntity } from './entities';
import {
  AdaptiveProfile,
  computeAdaptiveProfile,
  AdaptiveProfileInput,
} from './adaptive-profile';
import { MealLogService } from 'src/meal-log/meal-log.service';
import { MealPlanService } from 'src/meal-plan/meal-plan.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AdaptiveService {
  private readonly logger = new Logger(AdaptiveService.name);

  constructor(
    @InjectRepository(AdaptiveProfileEntity)
    private readonly profileRepo: Repository<AdaptiveProfileEntity>,
    private readonly mealLogService: MealLogService,
    private readonly mealPlanService: MealPlanService,
    private readonly userService: UserService,
  ) {}

  /**
   * Compute and persist the AdaptiveProfile for a given week.
   */
  async computeAndStore(userId: number, weekStartDate?: string): Promise<AdaptiveProfile> {
    const start = weekStartDate || this.getMondayOfCurrentWeek();

    const { weeklyA, weeklyO, slotAdherence, skippedFoods, preferredFoods } =
      await this.computeWeeklyScores(userId, start);

    const weekStreak = await this.computeWeekStreak(userId, start);
    const weekNumber = await this.computeWeekNumber(userId);

    // Get previous week's complexity for delta calculation
    const prevStart = this.offsetWeek(start, -1);
    const prev = await this.profileRepo.findOne({
      where: { userId, weekStartDate: prevStart },
    });
    const baseComplexity = prev?.complexityTarget ?? 5;

    const input: AdaptiveProfileInput = {
      userId,
      weekStartDate: start,
      adherenceScore: weeklyA,
      outcomeScore: weeklyO,
      weekStreak,
      weekNumber,
      baseComplexity,
      skippedFoods,
      preferredFoods,
      slotAdherence,
    };

    const profile = computeAdaptiveProfile(input);

    // Upsert
    const existing = await this.profileRepo.findOne({
      where: { userId, weekStartDate: start },
    });

    if (existing) {
      Object.assign(existing, this.toEntity(userId, profile));
      await this.profileRepo.save(existing);
    } else {
      const entity = this.profileRepo.create(this.toEntity(userId, profile));
      await this.profileRepo.save(entity);
    }

    return profile;
  }

  async getCurrent(userId: number): Promise<AdaptiveProfileEntity | null> {
    return this.profileRepo.findOne({
      where: { userId },
      order: { weekStartDate: 'DESC' },
    });
  }

  async getHistory(userId: number, limit = 12): Promise<AdaptiveProfileEntity[]> {
    return this.profileRepo.find({
      where: { userId },
      order: { weekStartDate: 'DESC' },
      take: limit,
    });
  }

  // ── Weekly score aggregation ──────────────────────────────────────────

  private async computeWeeklyScores(userId: number, weekStart: string) {
    const userProfile = await this.userService.getProfile(userId);
    const targetCals = Number(userProfile.targetCalories) || 0;
    const goal = userProfile.dietaryGoal || 'maintain';
    const macroTargets = this.computeMacroTargets(targetCals, goal);

    // Try to get active plan
    let planItems: any[] = [];
    let planStartDate: Date | null = null;
    try {
      const plan = await this.mealPlanService.getActive(userId);
      planItems = plan.items;
      planStartDate = new Date(plan.startDate);
    } catch {}

    const dailyA: number[] = [];
    const dailyO: number[] = [];
    const slotScores: Record<string, number[]> = {};
    const plannedFoodIds = new Map<number, number>(); // foodId → times planned
    const loggedFoodIds = new Map<number, number>();   // foodId → times logged

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const summary = await this.mealLogService.getDailySummary(userId, dateStr);

      // Outcome score (O) — spec formula: cal*0.6 + avg(protein, carbs, fat)*0.4
      if (summary.logCount > 0) {
        const calScore = targetCals > 0
          ? Math.max(0, Math.min(1, 1 - Math.abs(summary.totals.calories - targetCals) / targetCals))
          : 0;
        const protScore = macroTargets.protein > 0
          ? Math.max(0, Math.min(1, 1 - Math.abs(summary.totals.protein - macroTargets.protein) / macroTargets.protein))
          : 1;
        const carbScore = macroTargets.carbs > 0
          ? Math.max(0, Math.min(1, 1 - Math.abs(summary.totals.carbs - macroTargets.carbs) / macroTargets.carbs))
          : 1;
        const fatScore = macroTargets.fat > 0
          ? Math.max(0, Math.min(1, 1 - Math.abs(summary.totals.fat - macroTargets.fat) / macroTargets.fat))
          : 1;
        const macroScore = (protScore + carbScore + fatScore) / 3;
        dailyO.push(calScore * 0.6 + macroScore * 0.4);
      }

      // Adherence score (A) — slot-based, only if plan exists
      if (planItems.length > 0 && planStartDate) {
        const diffDays = Math.floor(
          (d.getTime() - planStartDate.getTime()) / (1000 * 60 * 60 * 24),
        ) + 1;

        if (diffDays >= 1 && diffDays <= 7) {
          const dayPlanItems = planItems.filter((item) => item.day === diffDays);

          // Group planned by recipe slot
          const slots = new Map<string, Set<number>>();
          for (const item of dayPlanItems) {
            const key = `${item.mealType}::${item.recipeName || item.foodItemId}`;
            if (!slots.has(key)) slots.set(key, new Set());
            slots.get(key)!.add(item.foodItemId);

            // Track planned food frequency
            plannedFoodIds.set(item.foodItemId, (plannedFoodIds.get(item.foodItemId) || 0) + 1);
          }

          if (slots.size > 0) {
            let slotTotal = 0;
            for (const [, slot] of slots) {
              const mealType = [...slots.entries()].find(([, v]) => v === slot)?.[0]?.split('::')[0] || '';
              const logsInSlot = summary.meals[mealType] || [];

              if (logsInSlot.length === 0) {
                slotTotal += 0;
              } else {
                const loggedIds = new Set(logsInSlot.map((l: any) => l.foodItemId));
                const hasMatch = [...slot].some(id => loggedIds.has(id));
                slotTotal += hasMatch ? 1.0 : 0.5;
              }

              // Track per-slot adherence
              if (!slotScores[mealType]) slotScores[mealType] = [];
              slotScores[mealType].push(logsInSlot.length === 0 ? 0 : ([...slot].some(id => new Set(logsInSlot.map((l: any) => l.foodItemId)).has(id)) ? 1 : 0.5));
            }
            dailyA.push(slotTotal / slots.size);
          }
        }
      }

      // Track logged food frequency
      for (const logs of Object.values(summary.meals)) {
        for (const log of logs as any[]) {
          loggedFoodIds.set(log.foodItemId, (loggedFoodIds.get(log.foodItemId) || 0) + 1);
        }
      }
    }

    const weeklyA = dailyA.length > 0 ? dailyA.reduce((s, v) => s + v, 0) / dailyA.length : 0;
    const weeklyO = dailyO.length > 0 ? dailyO.reduce((s, v) => s + v, 0) / dailyO.length : 0;

    // Slot adherence: per-slot weekly average
    const slotAdherence: Record<string, number> = {};
    for (const [slot, scores] of Object.entries(slotScores)) {
      slotAdherence[slot] = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    }

    // Skipped foods: planned but never logged
    const skippedFoods = [...plannedFoodIds.keys()].filter(id => !loggedFoodIds.has(id));

    // Preferred foods: logged most frequently (top 10)
    const preferredFoods = [...loggedFoodIds.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    return { weeklyA, weeklyO, slotAdherence, skippedFoods, preferredFoods };
  }

  private async computeWeekStreak(userId: number, weekStart: string): Promise<number> {
    let streak = 0;
    let current = weekStart;

    for (let i = 0; i < 52; i++) {
      // Check if the user logged anything in this week
      let hasLogs = false;
      for (let d = 0; d < 7; d++) {
        const date = new Date(current);
        date.setDate(date.getDate() + d);
        const dateStr = date.toISOString().split('T')[0];
        try {
          const summary = await this.mealLogService.getDailySummary(userId, dateStr);
          if (summary.logCount > 0) { hasLogs = true; break; }
        } catch {}
      }

      if (!hasLogs) break;
      streak++;
      current = this.offsetWeek(current, -1);
    }

    return streak;
  }

  private async computeWeekNumber(userId: number): Promise<number> {
    // Approximate: weeks since profile creation
    try {
      const profile = await this.userService.getProfile(userId);
      const created = new Date(profile.createdAt);
      const now = new Date();
      return Math.max(1, Math.ceil((now.getTime() - created.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    } catch {
      return 1;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

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

  private getMondayOfCurrentWeek(): string {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - ((day + 6) % 7);
    const monday = new Date(now);
    monday.setDate(diff);
    return monday.toISOString().split('T')[0];
  }

  private offsetWeek(dateStr: string, weeks: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().split('T')[0];
  }

  private toEntity(userId: number, profile: AdaptiveProfile) {
    return {
      userId,
      weekStartDate: profile.weekStartDate,
      quadrant: profile.quadrant,
      strictnessLevel: profile.strictnessLevel,
      planMode: profile.planMode,
      pressureScore: profile.pressureScore,
      complexityTarget: profile.complexityTarget,
      simplifyFlag: profile.simplifyFlag,
      recalibrateFlag: profile.recalibrateFlag,
      adherenceScore: profile.adherenceScore,
      outcomeScore: profile.outcomeScore,
      weekStreak: profile.weekStreak,
      weekNumber: profile.weekNumber,
      skippedFoods: profile.skippedFoods,
      preferredFoods: profile.preferredFoods,
      slotAdherence: profile.slotAdherence,
      computedAt: new Date(profile.computedAt),
    };
  }
}
