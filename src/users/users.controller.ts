import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { AddressDto } from './dto/address.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // User endpoints - users can manage their own addresses
  @Get('me/addresses')
  getMyAddresses(@CurrentUser() user: JwtPayload) {
    return this.usersService.getUserAddresses(user.sub);
  }

  @Patch('me')
  updateMyProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateUserDto) {
    return this.usersService.updateSelf(user.sub, dto);
  }

  @Post('me/addresses')
  addMyAddress(@CurrentUser() user: JwtPayload, @Body() address: AddressDto) {
    return this.usersService.addAddress(user.sub, address);
  }

  @Patch('me/addresses/:index')
  updateMyAddress(
    @CurrentUser() user: JwtPayload,
    @Param('index') index: string,
    @Body() address: AddressDto,
  ) {
    return this.usersService.updateAddress(user.sub, Number(index), address);
  }

  @Delete('me/addresses/:index')
  deleteMyAddress(@CurrentUser() user: JwtPayload, @Param('index') index: string) {
    return this.usersService.deleteAddress(user.sub, Number(index));
  }

  @Patch('me/addresses/:index/default')
  setMyDefaultAddress(@CurrentUser() user: JwtPayload, @Param('index') index: string) {
    return this.usersService.setDefaultAddress(user.sub, Number(index));
  }

  // Favorites
  @Get('me/favorites')
  getMyFavorites(@CurrentUser() user: JwtPayload) {
    return this.usersService.getFavorites(user.sub);
  }

  @Post('me/favorites/:productId')
  addFavorite(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseObjectIdPipe) productId: string,
  ) {
    return this.usersService.addFavorite(user.sub, productId);
  }

  @Delete('me/favorites/:productId')
  removeFavorite(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseObjectIdPipe) productId: string,
  ) {
    return this.usersService.removeFavorite(user.sub, productId);
  }

  // Admin endpoints
  @Roles('admin')
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Roles('admin')
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Roles('admin')
  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Roles('admin')
  @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.usersService.remove(id);
  }

  @Roles('admin')
  @Post(':id/address')
  addAddress(@Param('id', ParseObjectIdPipe) id: string, @Body() address: AddressDto) {
    return this.usersService.addAddress(id, address);
  }

  @Roles('admin')
  @Patch(':id/address/:index/default')
  setDefaultAddress(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('index') index: string,
  ) {
    return this.usersService.setDefaultAddress(id, Number(index));
  }
}
