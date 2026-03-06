import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { GenerateOrderEwayBillDto } from './dto/generate-order-ewaybill.dto';
import { EstimateOrderDto } from './dto/estimate-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('estimate')
  estimate(@Body() payload: EstimateOrderDto) {
    return this.ordersService.estimate(payload);
  }

  @Post()
  create(@Body() payload: CreateOrderDto) {
    return this.ordersService.create(payload);
  }

  @Get()
  list(@Query() query: OrdersQueryDto) {
    return this.ordersService.list(query);
  }

  @Get(':orderId')
  findById(@Param('orderId') orderId: string) {
    return this.ordersService.findById(orderId);
  }

  @Get(':orderId/timeline')
  timeline(@Param('orderId') orderId: string) {
    return this.ordersService.timeline(orderId);
  }

  @Get(':orderId/location-history')
  locationHistory(@Param('orderId') orderId: string) {
    return this.ordersService.locationHistory(orderId);
  }

  @Post(':orderId/cancel')
  cancel(@Param('orderId') orderId: string) {
    return this.ordersService.cancel(orderId);
  }

  @Post(':orderId/ewaybill')
  generateEwayBill(@Param('orderId') orderId: string, @Body() payload: GenerateOrderEwayBillDto) {
    return this.ordersService.attachEwayBill(orderId, payload);
  }
}
