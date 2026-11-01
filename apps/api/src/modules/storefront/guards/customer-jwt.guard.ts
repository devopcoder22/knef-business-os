import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/services/prisma.service';

export interface CustomerJwtPayload {
  sub: string;
  orgId: string;
  email: string;
  type: string;
  iat?: number;
  exp?: number;
}

export interface CustomerAccountContext {
  id: string;
  organizationId: string;
  customerId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isVerified: boolean;
  isActive: boolean;
}

@Injectable()
export class CustomerJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string>;
    const authHeader = headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Customer authentication required');
    }

    const token = authHeader.slice(7);
    let payload: CustomerJwtPayload;

    try {
      payload = this.jwtService.verify<CustomerJwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired customer token');
    }

    if (payload.type !== 'customer') {
      throw new UnauthorizedException(
        'Invalid token type — staff tokens cannot access customer endpoints',
      );
    }

    const account = await this.prisma.customerAccount.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        organizationId: true,
        customerId: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isVerified: true,
        isActive: true,
      },
    });

    if (!account || !account.isActive) {
      throw new UnauthorizedException('Customer account not found or inactive');
    }

    request['customerAccount'] = account;
    return true;
  }
}
