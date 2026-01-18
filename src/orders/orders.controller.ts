import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.ordersService.findAll(user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.findOne(id, user);
  }

  @Patch(':id/rollback')
  rollback(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.rollback(id, user);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.cancel(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.remove(id, user);
  }
}
