import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MockLoginDto } from './dto/mock-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('mock-login')
  mockLogin(@Body() payload: MockLoginDto) {
    return this.authService.mockLogin(payload);
  }
}
