import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import {
  AppConfig,
  DBConfig,
  EmailConfig,
  JwtConfig,
} from './registered-configs';
import { getEnvFilePaths } from './config.utils';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [AppConfig, DBConfig, JwtConfig, EmailConfig],
      envFilePath: getEnvFilePaths(),
    }),
  ],
})
export class ConfigModule {}
