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
import { CartsService } from './carts.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { AddCartItemDto } from './dto/add-cart-item.dto';

@Controller('carts')
@UseGuards(JwtAuthGuard)
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCartDto) {
    return this.cartsService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.cartsService.findAll(user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cartsService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCartDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cartsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cartsService.remove(id, user);
  }

  @Post('items')
  addItem(@CurrentUser() user: JwtPayload, @Body() dto: AddCartItemDto) {
    return this.cartsService.addItemForUser(user, dto.productId, dto.quantity);
  }
}
