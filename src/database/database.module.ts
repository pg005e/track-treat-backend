import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('db.masterUrl'),
        ssl: config.get<boolean>('db.ssl')
          ? { rejectUnauthorized: false }
          : false,
        synchronize: config.get<boolean>('db.schemaSync'),
        logging: config.get<boolean>('db.queryLogging'),
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
