import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsOptional,
} from "class-validator";
import { registerAs } from "@nestjs/config";
import { ConfigKey, validateConfig } from "../config.utils";

class EmailConfigVariables {
  @IsString()
  @IsNotEmpty()
  readonly host: string;

  @IsNumber()
  @Min(0)
  @Max(65535)
  readonly port: number;

  @IsBoolean()
  readonly secure: boolean;

  @IsString()
  @IsNotEmpty()
  readonly user: string;

  @IsString()
  @IsNotEmpty()
  readonly password: string;

  @IsString()
  @IsNotEmpty()
  readonly fromName: string;

  @IsString()
  @IsNotEmpty()
  readonly fromAddress: string;

  @IsString()
  @IsOptional()
  readonly appUrl?: string;
}

export const EmailConfig = registerAs(ConfigKey.Email, () => {
  const values = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    fromName: process.env.SMTP_FROM_NAME || "FChat",
    fromAddress: process.env.SMTP_FROM_ADDRESS,
    appUrl: process.env.APP_URL || "https://app.fchat.com",
  };
  return validateConfig(EmailConfigVariables, values);
});
