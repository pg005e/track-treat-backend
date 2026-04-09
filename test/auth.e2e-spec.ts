import request from 'supertest';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { EmailService } from 'src/email/email.service';

describe('AuthController', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let emailService: { sendOtp: jest.Mock };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({ sendOtp: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = moduleRef.get(DataSource);
    emailService = moduleRef.get(EmailService);
  });

  afterAll(async () => {
    await dataSource.dropDatabase();
    await app.close();
  });

  describe('POST /auth/register', () => {
    const validDto = {
      email: 'testuser@example.com',
      username: 'testuser',
      password: 'testpassword123',
    };

    it('should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(validDto)
        .expect(201);

      expect(res.body).toEqual({
        message:
          'Registration successful. Please verify your email with the OTP sent.',
        username: validDto.username,
      });
    });

    it('should return 409 when email or username is already taken', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(validDto)
        .expect(409);
    });

    it('should return 400 for invalid email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validDto, email: 'not-an-email' })
        .expect(400);
    });

    it('should return 400 for short username', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validDto, email: 'other@example.com', username: 'ab' })
        .expect(400);
    });

    it('should return 400 for username with special characters', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...validDto,
          email: 'other@example.com',
          username: 'test@user',
        })
        .expect(400);
    });

    it('should return 400 for short password', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...validDto,
          email: 'other@example.com',
          username: 'another_user',
          password: 'short',
        })
        .expect(400);
    });

    it('should return 400 for unknown properties', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validDto, email: 'new@example.com', unknown: 'field' })
        .expect(400);
    });
  });

  describe('POST /auth/verify-otp', () => {
    const registerDto = {
      email: 'otpuser@example.com',
      username: 'otpuser',
      password: 'testpassword123',
    };

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto);
    });

    it('should verify otp and return tokens', async () => {
      const otpCode = emailService.sendOtp.mock.calls.at(-1)[1];

      const res = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ username: registerDto.username, code: otpCode })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: {
          id: expect.any(Number),
          username: registerDto.username,
          email: registerDto.email,
        },
      });
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ username: 'nonexistent', code: '123456' })
        .expect(404);
    });

    it('should return 400 for invalid code length', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ username: registerDto.username, code: '123' })
        .expect(400);
    });

    it('should return 401 for invalid otp code', async () => {
      // register a fresh unverified user
      await request(app.getHttpServer()).post('/auth/register').send({
        email: 'unverified@example.com',
        username: 'unverified_user',
        password: 'testpassword123',
      });

      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ username: 'unverified_user', code: '000000' })
        .expect(401);
    });

    it('should return 400 if user is already verified', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ username: registerDto.username, code: '123456' })
        .expect(400);
    });
  });

  describe('POST /auth/resend-otp', () => {
    const registerDto = {
      email: 'resendotp@example.com',
      username: 'resendotp_user',
      password: 'testpassword123',
    };

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto);
    });

    it('should resend otp and return 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ username: registerDto.username })
        .expect(200);

      expect(res.body).toEqual({ message: 'OTP resent successfully' });
    });

    it('should invalidate old otp after resend', async () => {
      const oldOtpCode = emailService.sendOtp.mock.calls.at(-2)[1];

      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ username: registerDto.username, code: oldOtpCode })
        .expect(401);
    });

    it('should verify with new otp after resend', async () => {
      const newOtpCode = emailService.sendOtp.mock.calls.at(-1)[1];

      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ username: registerDto.username, code: newOtpCode })
        .expect(200);
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ username: 'ghost_user' })
        .expect(404);
    });

    it('should return 400 if user already verified', async () => {
      // registerDto user verified in previous test
      await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ username: registerDto.username })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    const verifiedUserLoginDto = {
      username: 'otpuser',
      password: 'testpassword123',
    };
    const unverifiedUserLoginDto = {
      username: 'testuser',
      password: 'testpassword123',
    };

    it('should login the user and return tokens with 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(verifiedUserLoginDto)
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: {
          id: expect.any(Number),
          username: verifiedUserLoginDto.username,
          email: expect.any(String),
        },
      });
    });

    it('should throw 401 if user does not exist', async () => {
      const nonExistentUser = { username: 'john', password: 'testpassword123' };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(nonExistentUser)
        .expect(401);
    });

    it('should throw 401 for password does not match', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...verifiedUserLoginDto, password: 'wrongpassword' })
        .expect(401);
    });

    it('should throw 403 for unverified user', async () => {});
  });
});
