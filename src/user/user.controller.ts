import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards';
import { CurrentUser } from 'src/auth/decorators';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me/profile')
  getProfile(@CurrentUser('id') userId: number) {
    return this.userService.getProfile(userId);
  }

  @Put('me/profile')
  updateProfile(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(userId, dto);
  }

  @Get('me/stats')
  async getStats(@CurrentUser('id') userId: number) {
    const profile = await this.userService.getProfile(userId);
    const bmr = this.userService.calculateBmr(profile);
    const tdee = this.userService.calculateTdee(profile);

    return {
      bmr,
      tdee,
      targetCalories: profile.targetCalories,
      currentWeight: profile.currentWeight,
      initialWeight: profile.initialWeight,
      dietaryGoal: profile.dietaryGoal,
      onboardingCompleted: profile.onboardingCompleted,
    };
  }
}
