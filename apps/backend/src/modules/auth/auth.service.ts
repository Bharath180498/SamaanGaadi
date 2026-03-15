import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthSessionStatus, UserRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MockLoginDto } from './dto/mock-login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService
  ) {}

  private get authMode() {
    return this.configService.get<string>('authMode') ?? 'mock';
  }

  private get otpProvider() {
    return this.configService.get<string>('otpProvider') ?? 'mock';
  }

  private get otpTtlSeconds() {
    return this.configService.get<number>('otp.ttlSeconds') ?? 300;
  }

  private get fixedOtpCode() {
    return this.configService.get<string>('otp.fixedCode') ?? '123456';
  }

  private get adminPasscode() {
    return this.configService.get<string>('adminPasscode') ?? '';
  }

  private async issueSession(user: { id: string; role: UserRole }) {
    const token = await this.jwtService.signAsync({
      userId: user.id,
      role: user.role
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        accessToken: token,
        status: AuthSessionStatus.ACTIVE,
        expiresAt
      }
    });

    return {
      token,
      sessionId: session.id,
      expiresAt
    };
  }

  private generateOtpCode() {
    if (this.authMode === 'mock') {
      return this.fixedOtpCode;
    }

    const value = Math.floor(Math.random() * 900000) + 100000;
    return String(value);
  }

  private async sendOtpViaTwilio(phone: string, code: string) {
    const accountSid = this.configService.get<string>('twilio.accountSid') ?? '';
    const authToken = this.configService.get<string>('twilio.authToken') ?? '';
    const messagingServiceSid = this.configService.get<string>('twilio.messagingServiceSid') ?? '';
    const fromNumber = this.configService.get<string>('twilio.fromNumber') ?? '';

    if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
      return {
        sent: false,
        mode: 'mock' as const,
        reason: 'Twilio credentials are not configured'
      };
    }

    const payload = new URLSearchParams();
    payload.set('To', phone);
    payload.set('Body', `Qargo OTP: ${code}. Valid for ${Math.ceil(this.otpTtlSeconds / 60)} min.`);

    if (messagingServiceSid) {
      payload.set('MessagingServiceSid', messagingServiceSid);
    } else {
      payload.set('From', fromNumber);
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: payload.toString()
      }
    );

    const data = (await response.json()) as {
      sid?: string;
      message?: string;
      code?: number;
    };

    if (!response.ok) {
      return {
        sent: false,
        mode: 'twilio' as const,
        reason: data?.message ?? `Twilio error ${response.status}`
      };
    }

    return {
      sent: true,
      mode: 'twilio' as const,
      providerRef: data?.sid
    };
  }

  private async dispatchOtp(phone: string, code: string) {
    if (this.authMode === 'mock' || this.otpProvider === 'mock') {
      return {
        sent: false,
        mode: 'mock' as const,
        reason: 'Mock OTP mode enabled'
      };
    }

    if (this.otpProvider === 'twilio') {
      try {
        return await this.sendOtpViaTwilio(phone, code);
      } catch (error) {
        const message =
          typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message: string }).message
            : 'Unknown Twilio error';

        return {
          sent: false,
          mode: 'twilio' as const,
          reason: message
        };
      }
    }

    return {
      sent: false,
      mode: 'mock' as const,
      reason: `Unsupported OTP provider: ${this.otpProvider}`
    };
  }

  async mockLogin(payload: MockLoginDto) {
    const user = await this.usersService.findOrCreateByPhone(payload);
    const session = await this.issueSession({ id: user.id, role: user.role });

    return {
      token: session.token,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      user
    };
  }

  async adminPasscodeLogin(passcode: string) {
    const configuredPasscode = this.adminPasscode.trim();
    if (!configuredPasscode || passcode.trim() !== configuredPasscode) {
      throw new UnauthorizedException('Invalid admin passcode');
    }

    let admin = await this.prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
      orderBy: { createdAt: 'asc' }
    });

    if (!admin) {
      admin = await this.usersService.findOrCreateByPhone({
        name: 'Ops Admin',
        phone: '+919000000201',
        role: UserRole.ADMIN
      });
    }

    const session = await this.issueSession({ id: admin.id, role: admin.role });

    return {
      token: session.token,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      user: admin
    };
  }

  async requestOtp(payload: RequestOtpDto) {
    const code = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + this.otpTtlSeconds * 1000);

    await this.prisma.otpSession.updateMany({
      where: {
        phone: payload.phone,
        role: payload.role,
        status: AuthSessionStatus.ACTIVE
      },
      data: {
        status: AuthSessionStatus.EXPIRED
      }
    });

    const otpSession = await this.prisma.otpSession.create({
      data: {
        phone: payload.phone,
        role: payload.role,
        otpCode: code,
        expiresAt
      }
    });

    const delivery = await this.dispatchOtp(payload.phone, code);

    if (!delivery.sent && delivery.mode !== 'mock') {
      this.logger.warn(`OTP delivery failed for ${payload.phone}: ${delivery.reason ?? 'unknown reason'}`);
    }

    return {
      otpSessionId: otpSession.id,
      expiresAt,
      provider: delivery.mode,
      deliveryStatus: delivery.sent ? 'SENT' : 'FALLBACK',
      // Returned intentionally in fallback mode so app testing works without SMS provider.
      code: this.authMode === 'mock' || !delivery.sent ? code : undefined
    };
  }

  async verifyOtp(payload: VerifyOtpDto) {
    const session = await this.prisma.otpSession.findFirst({
      where: {
        phone: payload.phone,
        role: payload.role,
        status: AuthSessionStatus.ACTIVE
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!session) {
      throw new UnauthorizedException('OTP session not found');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.otpSession.update({
        where: { id: session.id },
        data: { status: AuthSessionStatus.EXPIRED }
      });
      throw new UnauthorizedException('OTP expired');
    }

    if (session.otpCode !== payload.code) {
      await this.prisma.otpSession.update({
        where: { id: session.id },
        data: { attempts: { increment: 1 } }
      });
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.prisma.otpSession.update({
      where: { id: session.id },
      data: {
        verifiedAt: new Date(),
        status: AuthSessionStatus.EXPIRED
      }
    });

    const user = await this.usersService.findOrCreateByPhone({
      name: payload.name ?? `${payload.role.toLowerCase()} user`,
      phone: payload.phone,
      role: payload.role
    });

    const authSession = await this.issueSession({ id: user.id, role: user.role });

    if (user.role === UserRole.DRIVER) {
      const normalizedName = user.name.trim();
      const shouldSeedFullName =
        normalizedName.length > 0 &&
        !/^(driver|customer|admin)\s+user$/i.test(normalizedName);

      await this.prisma.driverOnboarding.upsert({
        where: { userId: user.id },
        update: {
          phone: user.phone,
          ...(shouldSeedFullName ? { fullName: user.name } : {})
        },
        create: {
          userId: user.id,
          phone: user.phone,
          ...(shouldSeedFullName ? { fullName: user.name } : {})
        }
      });
    }

    return {
      token: authSession.token,
      sessionId: authSession.sessionId,
      expiresAt: authSession.expiresAt,
      user
    };
  }

  async logout(token: string) {
    if (!token) {
      return { success: true };
    }

    await this.prisma.authSession.updateMany({
      where: {
        accessToken: token,
        status: AuthSessionStatus.ACTIVE
      },
      data: {
        status: AuthSessionStatus.REVOKED,
        revokedAt: new Date()
      }
    });

    return { success: true };
  }
}
