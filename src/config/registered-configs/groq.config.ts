import { IsString, IsOptional } from 'class-validator';
import { registerAs } from '@nestjs/config';
import { ConfigKey, validateConfig } from '../config.utils';

class GroqConfigVariables {
  @IsOptional()
  @IsString()
  readonly apiKey?: string;

  @IsOptional()
  @IsString()
  readonly model?: string;
}

export const GroqConfig = registerAs(ConfigKey.Groq, () => {
  const values = {
    apiKey: process.env.GROQ_API_KEY || undefined,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  };
  return validateConfig(GroqConfigVariables, values);
});
