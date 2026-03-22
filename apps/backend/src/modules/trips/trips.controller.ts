import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripDriverActionDto } from './dto/trip-driver-action.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { RateTripDto } from './dto/rate-trip.dto';
import { GenerateDeliveryProofUploadUrlDto } from './dto/generate-delivery-proof-upload-url.dto';

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get(':tripId')
  findById(@Param('tripId') tripId: string) {
    return this.tripsService.findById(tripId);
  }

  @Post(':tripId/accept')
  accept(@Param('tripId') tripId: string, @Body() payload: TripDriverActionDto) {
    return this.tripsService.accept(tripId, payload.driverId);
  }

  @Post(':tripId/arrived-pickup')
  arrivedPickup(@Param('tripId') tripId: string, @Body() payload: TripDriverActionDto) {
    return this.tripsService.arrivedPickup(tripId, payload.driverId);
  }

  @Post(':tripId/start-loading')
  startLoading(@Param('tripId') tripId: string, @Body() payload: TripDriverActionDto) {
    return this.tripsService.startLoading(tripId, payload.driverId, payload.rideStartOtp);
  }

  @Post(':tripId/start-transit')
  startTransit(@Param('tripId') tripId: string, @Body() payload: TripDriverActionDto) {
    return this.tripsService.startTransit(tripId, payload.driverId);
  }

  @Post(':tripId/delivery-proof/upload-url')
  deliveryProofUploadUrl(
    @Param('tripId') tripId: string,
    @Body() payload: GenerateDeliveryProofUploadUrlDto
  ) {
    return this.tripsService.generateDeliveryProofUploadUrl(tripId, payload);
  }

  @Post(':tripId/complete')
  complete(
    @Param('tripId') tripId: string,
    @Body() payload: CompleteTripDto & TripDriverActionDto
  ) {
    return this.tripsService.complete(tripId, payload.driverId, payload);
  }

  @Post(':tripId/rate')
  rate(@Param('tripId') tripId: string, @Body() payload: RateTripDto) {
    return this.tripsService.rate(tripId, payload);
  }

  @Post(':tripId/sos')
  sos(@Param('tripId') tripId: string, @Body() payload: TripDriverActionDto) {
    return this.tripsService.sos(tripId, payload.driverId);
  }
}
