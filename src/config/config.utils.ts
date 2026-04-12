import { join, resolve } from 'node:path';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AppConfig,
  DBConfig,
  EmailConfig,
  GroqConfig,
} from './registered-configs';

export const APP_ROOT = resolve(__dirname, '../..');
export function getEnvFilePaths(): string[] {
  return [join(APP_ROOT, '.env.local'), join(APP_ROOT, '.env')];
}

export enum ConfigKey {
  App = 'app',
  Db = 'db',
  Email = 'email',
  Groq = 'groq',
}

type PrefixedDotKeys<T, P extends string> = {
  [key in `${P}.${string & keyof T}`]: T[keyof T];
};

export type EnvironmentVariables = PrefixedDotKeys<
  ReturnType<typeof AppConfig>,
  ConfigKey.App
> &
  PrefixedDotKeys<ReturnType<typeof DBConfig>, ConfigKey.Db> &
  PrefixedDotKeys<ReturnType<typeof EmailConfig>, ConfigKey.Email> &
  PrefixedDotKeys<ReturnType<typeof GroqConfig>, ConfigKey.Groq>;

export function validateConfig<T extends object>(
  cls: ClassConstructor<T>,
  config: Record<string, unknown>,
) {
  const configInstance = plainToInstance(cls, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(configInstance, {
    skipMissingProperties: false,
  });
  if (errors.length > 0) throw new Error(errors.toString());
  return configInstance;
}
