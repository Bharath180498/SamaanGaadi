import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { SetDriverAvailabilityDto } from './dto/set-driver-availability.dto';
import { DriverEarningsQueryDto } from './dto/driver-earnings-query.dto';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post('location')
  updateLocation(@Body() payload: UpdateDriverLocationDto) {
    return this.driversService.updateLocation(payload);
  }

  @Post(':driverId/availability')
  setAvailability(
    @Param('driverId') driverId: string,
    @Body() payload: SetDriverAvailabilityDto
  ) {
    return this.driversService.setAvailability(driverId, payload.status);
  }

  @Get('nearby')
  findNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius = '8',
    @Query('vehicleType') vehicleType?: string,
    @Query('minRating') minRating?: string
  ) {
    return this.driversService.findNearby({
      lat: Number(lat),
      lng: Number(lng),
      radiusKm: Number(radius),
      vehicleType,
      minRating: minRating ? Number(minRating) : undefined
    });
  }

  @Get(':driverId/jobs')
  getDriverJobs(@Param('driverId') driverId: string) {
    return this.driversService.getDriverJobs(driverId);
  }

  @Get(':driverId/earnings')
  earnings(@Param('driverId') driverId: string, @Query() query: DriverEarningsQueryDto) {
    return this.driversService.earnings(driverId, query);
  }

  @Get('admin/pending-approvals')
  pendingApprovals() {
    return this.driversService.pendingApprovals();
  }

  @Post(':driverId/approve')
  approve(@Param('driverId') driverId: string) {
    return this.driversService.approve(driverId);
  }

  @Post(':driverId/reject')
  reject(@Param('driverId') driverId: string) {
    return this.driversService.reject(driverId);
  }
}
