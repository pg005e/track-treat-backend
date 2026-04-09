import { IsEnum, IsNumber, Max, Min } from 'class-validator';
import { registerAs } from '@nestjs/config';
import { ConfigKey, validateConfig } from '../config.utils';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

class AppConfigVariables {
  @IsEnum(Environment)
  readonly env: Environment;

  @IsNumber()
  @Min(0)
  @Max(65535)
  readonly port: number;
}

export const AppConfig = registerAs(ConfigKey.App, () => {
  const values = {
    env: process.env.NODE_ENV,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3001,
  };
  return validateConfig(AppConfigVariables, values);
});
