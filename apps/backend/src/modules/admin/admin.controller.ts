import { Controller, Get } from '@nestjs/common';
import { AdminService } from './admin.service';

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

  @Get('fraud-alerts')
  fraudAlerts() {
    return this.adminService.fraudAlerts();
  }

  @Get('compliance')
  complianceOverview() {
    return this.adminService.complianceOverview();
  }
}
