import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

interface FindOrCreateInput {
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateByPhone(input: FindOrCreateInput) {
    const existing = await this.prisma.user.findUnique({ where: { phone: input.phone } });
    if (existing) {
      return existing;
    }

    return this.prisma.user.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email,
        role: input.role
      }
    });
  }

  async list(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { role: role as UserRole } : undefined,
      include: {
        driverProfile: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  }
}
