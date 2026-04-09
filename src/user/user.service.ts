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

  private calculateTargetCalories(profile: Profile): number {
    const tdee = this.calculateTdee(profile)!;

    switch (profile.dietaryGoal) {
      case 'lose':
        return Math.round(tdee * 0.8); // 20% deficit
      case 'gain':
        return Math.round(tdee * 1.15); // 15% surplus
      default:
        return tdee;
    }
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
