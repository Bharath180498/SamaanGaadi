import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class MockAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const authHeader: string | undefined = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const headerUserId = request.headers['x-user-id'];
      const headerRole = request.headers['x-user-role'];

      if (typeof headerUserId === 'string' && typeof headerRole === 'string') {
        request.user = { userId: headerUserId, role: headerRole };
      }

      return true;
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      request.user = this.jwtService.verify(token);
    } catch {
      request.user = null;
    }

    return true;
  }
}
