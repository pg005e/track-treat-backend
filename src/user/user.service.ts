import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Profile, ActivityLevel, BiologicalSex } from './entities/profile.entity';
import { UpdateProfileDto } from './dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
  ) {}

  async getProfile(userId: number) {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    let profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      profile = this.profileRepo.create({ userId });
    }

    Object.assign(profile, dto);

    // Set initial weight on first weight entry
    if (dto.currentWeight && !profile.initialWeight) {
      profile.initialWeight = dto.currentWeight;
    }

    // Auto-calculate target calories if we have enough data
    if (this.hasEnoughDataForTdee(profile)) {
      profile.targetCalories = this.calculateTargetCalories(profile);
      profile.onboardingCompleted = true;

      // Compute/validate meals per day
      const mealResult = this.computeOptimalMeals(
        Number(profile.targetCalories),
        dto.mealsPerDay, // user-provided value (or undefined)
      );
      profile.mealsPerDay = mealResult.mealsPerDay;
      profile.mealsPerDayAuto = mealResult.wasAdjusted;
    }

    return this.profileRepo.save(profile);
  }

  calculateBmr(profile: Profile): number | null {
    if (
      !profile.currentWeight ||
      !profile.heightCm ||
      !profile.birthDate ||
      !profile.biologicalSex
    ) {
      return null;
    }

    const age = this.calculateAge(profile.birthDate);
    const weight = Number(profile.currentWeight);
    const height = Number(profile.heightCm);

    // Mifflin-St Jeor equation
    if (profile.biologicalSex === BiologicalSex.Male) {
      return 10 * weight + 6.25 * height - 5 * age + 5;
    }
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }

  calculateTdee(profile: Profile): number | null {
    const bmr = this.calculateBmr(profile);
    if (!bmr || !profile.activityLevel) return null;

    const multipliers: Record<ActivityLevel, number> = {
      [ActivityLevel.Sedentary]: 1.2,
      [ActivityLevel.LightlyActive]: 1.375,
      [ActivityLevel.ModeratelyActive]: 1.55,
      [ActivityLevel.VeryActive]: 1.725,
      [ActivityLevel.ExtraActive]: 1.9,
    };

    return Math.round(bmr * multipliers[profile.activityLevel]);
  }

  /**
   * Compute or validate meals per day based on calorie target.
   *
   * Per-meal calorie range: 250–800 kcal.
   * If no value provided → auto-compute from target calories.
   * If value provided → validate against reasonable per-meal range and correct if needed.
   *
   * Returns { mealsPerDay, wasAdjusted: true if system changed the value }.
   */
  computeOptimalMeals(
    targetCalories: number,
    userValue?: number,
  ): { mealsPerDay: number; wasAdjusted: boolean } {
    const MIN_PER_MEAL = 250;
    const MAX_PER_MEAL = 800;
    const IDEAL_PER_MEAL = 500;
    const MIN_MEALS = 2;
    const MAX_MEALS = 8;

    const clamp = (v: number) => Math.max(MIN_MEALS, Math.min(MAX_MEALS, v));

    // No user value → auto-suggest
    if (userValue === undefined || userValue === null) {
      const suggested = clamp(Math.round(targetCalories / IDEAL_PER_MEAL));
      return { mealsPerDay: suggested, wasAdjusted: true };
    }

    const perMeal = targetCalories / userValue;

    // User value produces reasonable per-meal calories → accept
    if (perMeal >= MIN_PER_MEAL && perMeal <= MAX_PER_MEAL) {
      return { mealsPerDay: clamp(userValue), wasAdjusted: false };
    }

    // Per-meal too low (too many meals for the calories) → reduce meals
    if (perMeal < MIN_PER_MEAL) {
      const corrected = clamp(Math.floor(targetCalories / MIN_PER_MEAL));
      return { mealsPerDay: corrected, wasAdjusted: true };
    }

    // Per-meal too high (too few meals for the calories) → increase meals
    const corrected = clamp(Math.ceil(targetCalories / MAX_PER_MEAL));
    return { mealsPerDay: corrected, wasAdjusted: true };
  }

  calculateTargetFromTdee(tdee: number, goal: string | null): number {
    switch (goal) {
      case 'lose':
        return Math.round(tdee * 0.8);
      case 'gain':
        return Math.round(tdee * 1.15);
      default:
        return Math.round(tdee);
    }
  }

  private calculateTargetCalories(profile: Profile): number {
    const tdee = this.calculateTdee(profile)!;
    return this.calculateTargetFromTdee(tdee, profile.dietaryGoal);
  }

  private hasEnoughDataForTdee(profile: Profile): boolean {
    return !!(
      profile.currentWeight &&
      profile.heightCm &&
      profile.birthDate &&
      profile.biologicalSex &&
      profile.activityLevel &&
      profile.dietaryGoal
    );
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  }
}
