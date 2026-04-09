import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @Length(6, 6)
  code: string;
}
