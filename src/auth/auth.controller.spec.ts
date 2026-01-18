import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;
  let mailService: MailService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    sendRegisterOtp: jest.fn(),
    verifyRegisterOtp: jest.fn(),
    sendResetOtp: jest.fn(),
    verifyResetOtp: jest.fn(),
    resetPassword: jest.fn(),
  };

  const mockMailService = {
    sendOtpEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    mailService = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const registerDto = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      };

      const expectedResult = {
        user: { _id: '1', email: registerDto.email },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      };

      mockAuthService.register.mockResolvedValueOnce(expectedResult);

      const result = await controller.register(registerDto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
    });
  });

  describe('login', () => {
    it('should login a user', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const expectedResult = {
        user: { _id: '1', email: loginDto.email },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      };

      mockAuthService.login.mockResolvedValueOnce(expectedResult);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.login).toHaveBeenCalledWith(
        loginDto.email,
        loginDto.password,
      );
    });
  });
});
