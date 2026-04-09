import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { registerAs } from '@nestjs/config';
import { ConfigKey, validateConfig } from '../config.utils';

class DBConfigVariables {
  @IsString()
  @IsNotEmpty()
  readonly masterUrl: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  readonly slaveUrls: string[];

  @IsBoolean()
  readonly ssl: boolean;

  @IsBoolean()
  readonly schemaSync: boolean;

  @IsBoolean()
  readonly queryLogging: boolean;
}

export const DBConfig = registerAs(ConfigKey.Db, () => {
  const values = {
    masterUrl: process.env.POSTGRES_MASTER_URL,
    slaveUrls:
      process.env.POSTGRES_SLAVE_URLS &&
      process.env.POSTGRES_SLAVE_URLS.length > 0
        ? process.env.POSTGRES_SLAVE_URLS.split(',')
        : [process.env.POSTGRES_MASTER_URL],
    queryLogging: process.env.QUERY_LOGGING === 'true',
    ssl: process.env.POSTGRES_SSL === 'true',
    schemaSync: process.env.SCHEMA_SYNC === 'true',
  };

  return validateConfig(DBConfigVariables, values);
});
