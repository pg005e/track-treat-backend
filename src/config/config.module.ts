import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import {
  AppConfig,
  DBConfig,
  EmailConfig,
  JwtConfig,
  GroqConfig,
} from './registered-configs';
import { getEnvFilePaths } from './config.utils';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [AppConfig, DBConfig, JwtConfig, EmailConfig, GroqConfig],
      envFilePath: getEnvFilePaths(),
    }),
  ],
})
export class ConfigModule {}
