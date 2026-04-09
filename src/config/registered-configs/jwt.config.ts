import { registerAs } from '@nestjs/config';
import { IsNotEmpty, IsString } from 'class-validator';
import { validateConfig } from '../config.utils';

class JwtConfigVariables {
  @IsString()
  @IsNotEmpty()
  readonly accessSecret: string;

  @IsString()
  @IsNotEmpty()
  readonly accessExpiration: string;

  @IsString()
  @IsNotEmpty()
  readonly refreshSecret: string;

  @IsString()
  @IsNotEmpty()
  readonly refreshExpiration: string;

  @IsString()
  @IsNotEmpty()
  readonly onboardingSecret: string;

  @IsString()
  @IsNotEmpty()
  readonly onboardingExpiration: string;
}

export const JwtConfig = registerAs('jwt', () => {
  const values = {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
    onboardingSecret: process.env.JWT_ONBOARDING_SECRET,
    onboardingExpiration: process.env.JWT_ONBOARDING_EXPIRATION,
  };
  return validateConfig(JwtConfigVariables, values);
});
