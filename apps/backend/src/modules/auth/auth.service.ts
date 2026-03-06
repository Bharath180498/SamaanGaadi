import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MockLoginDto } from './dto/mock-login.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService
  ) {}

  async mockLogin(payload: MockLoginDto) {
    const user = await this.usersService.findOrCreateByPhone(payload);
    const token = await this.jwtService.signAsync({
      userId: user.id,
      role: user.role
    });

    return {
      token,
      user
    };
  }
}
