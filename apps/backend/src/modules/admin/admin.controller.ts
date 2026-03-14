import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import { KycVerificationStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { AdminOperationsBookingsQueryDto } from './dto/admin-operations-bookings-query.dto';
import { AdminOperationsRidesQueryDto } from './dto/admin-operations-rides-query.dto';
import { AdminKycHistoryQueryDto } from './dto/admin-kyc-history-query.dto';

@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  overview() {
    return this.adminService.overview();
  }

  @Get('analytics/trips')
  tripAnalytics() {
    return this.adminService.tripAnalytics();
  }

  @Get('analytics/heatmap')
  demandHeatmap() {
    return this.adminService.demandHeatmap();
  }

  @Get('analytics/dispatch')
  dispatchAnalytics() {
    return this.adminService.dispatchAnalytics();
  }

  @Get('fraud-alerts')
  fraudAlerts() {
    return this.adminService.fraudAlerts();
  }

  @Get('compliance')
  complianceOverview() {
    return this.adminService.complianceOverview();
  }

  @Get('operations/summary')
  operationsSummary() {
    return this.adminService.operationsSummary();
  }

  @Get('operations/bookings')
  operationsBookings(@Query() query: AdminOperationsBookingsQueryDto) {
    return this.adminService.operationsBookings(query);
  }

  @Get('operations/rides')
  operationsRides(@Query() query: AdminOperationsRidesQueryDto) {
    return this.adminService.operationsRides(query);
  }

  @Get('kyc/pending')
  pendingKyc() {
    return this.adminService.pendingKycReview();
  }

  @Get('kyc/history')
  kycHistory(@Query() query: AdminKycHistoryQueryDto) {
    return this.adminService.kycHistory(query.status ?? KycVerificationStatus.VERIFIED, query.limit);
  }

  @Get('kyc/:verificationId')
  kycReviewDetails(@Param('verificationId') verificationId: string) {
    return this.adminService.kycReviewDetails(verificationId);
  }

  @Post('kyc/:verificationId/approve')
  approveKyc(
    @Param('verificationId') verificationId: string,
    @CurrentUser() user: RequestUser | null
  ) {
    if (!user?.userId) {
      throw new UnauthorizedException('Admin authentication required');
    }
    return this.adminService.approveKyc(verificationId, user.userId);
  }

  @Post('kyc/:verificationId/reject')
  rejectKyc(
    @Param('verificationId') verificationId: string,
    @Body() payload: ReviewKycDto,
    @CurrentUser() user: RequestUser | null
  ) {
    if (!user?.userId) {
      throw new UnauthorizedException('Admin authentication required');
    }
    return this.adminService.rejectKyc(verificationId, user.userId, payload.reason ?? 'Rejected by admin review');
  }
}
