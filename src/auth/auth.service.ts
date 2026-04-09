import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from 'src/user/entities';
import { EmailService } from 'src/email/email.service';
import { Session, Otp } from './entities';
import { RegisterDto, LoginDto } from './dto';
import { JwtPayload } from './strategies/jwt.strategy';

const OTP_EXPIRY_MINUTES = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Otp) private readonly otpRepo: Repository<Otp>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({
      where: [{ email: dto.email }, { username: dto.username }],
    });
    if (existing) {
      throw new ConflictException('Email or username already taken');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = this.userRepo.create({
      email: dto.email,
      username: dto.username,
      password: hashedPassword,
      isVerified: false,
    });
    await this.userRepo.save(user);

    await this.generateAndSendOtp(user);

    return {
      message: 'Registration successful. Please verify your email with the OTP sent.',
      username: user.username,
    };
  }

  async verifyOtp(username: string, code: string) {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('User is already verified');
    }

    const otp = await this.otpRepo.findOne({
      where: {
        userId: user.id,
        code,
        isUsed: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    otp.isUsed = true;
    await this.otpRepo.save(otp);

    user.isVerified = true;
    await this.userRepo.save(user);

    return this.createTokens(user);
  }

  async resendOtp(username: string) {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('User is already verified');
    }

    // Invalidate any existing unused OTPs
    await this.otpRepo.update(
      { userId: user.id, isUsed: false },
      { isUsed: true },
    );

    await this.generateAndSendOtp(user);

    return { message: 'OTP resent successfully' };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { username: dto.username },
      select: ['id', 'username', 'email', 'password', 'isVerified'],
    });
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isVerified) {
      throw new ForbiddenException(
        'Email not verified. Please verify your email with the OTP sent during registration.',
      );
    }

    return this.createTokens(user);
  }

  async refreshTokens(refreshToken: string) {
    let payload: { sub: number; sessionId: number };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.sessionRepo.findOne({
      where: { id: payload.sessionId, userId: payload.sub, isRevoked: false },
      relations: ['user'],
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    session.isRevoked = true;
    await this.sessionRepo.save(session);

    return this.createTokens(session.user);
  }

  async logout(refreshToken: string) {
    let payload: { sub: number; sessionId: number };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      return;
    }

    await this.sessionRepo.update(
      { id: payload.sessionId, userId: payload.sub },
      { isRevoked: true },
    );
  }

  private async generateAndSendOtp(user: User) {
    const code = crypto.randomInt(100000, 999999).toString();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    const otp = this.otpRepo.create({
      userId: user.id,
      code,
      expiresAt,
    });
    await this.otpRepo.save(otp);

    await this.emailService.sendOtp(user.email!, code);
  }

  private async createTokens(user: User) {
    const accessPayload: JwtPayload = {
      sub: user.id,
      username: user.username,
    };

    const accessToken = this.jwt.sign(accessPayload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessExpiration') as any,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = this.sessionRepo.create({
      userId: user.id,
      refreshToken: '',
      expiresAt,
    });
    await this.sessionRepo.save(session);

    const refreshToken = this.jwt.sign(
      { sub: user.id, sessionId: session.id },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpiration') as any,
      },
    );

    session.refreshToken = refreshToken;
    await this.sessionRepo.save(session);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, email: user.email },
    };
  }
}
