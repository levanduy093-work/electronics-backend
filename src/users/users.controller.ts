import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Roles('admin')
  @Post(':id/vouchers')
  addVoucher(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: import('../vouchers/dto/create-voucher.dto').CreateVoucherDto,
  ) {
    return this.usersService.addVoucher(id, dto);
  }

  // User endpoints - users can manage their own addresses
  @Get('me/addresses')
  getMyAddresses(@CurrentUser() user: JwtPayload) {
    return this.usersService.getUserAddresses(user.sub);
  }

  @Patch('me')
  @UseInterceptors(FileInterceptor('avatar'))
  async updateMyProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUserDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    if (avatar) {
      const folder = `electronics-shop/avatars/${user.sub}`;
      const result = await this.cloudinaryService.uploadImage(avatar, folder);
      dto.avatar = result.secure_url;
    }
    return this.usersService.updateSelf(user.sub, dto);
  }

  @Post('me/fcm-token')
  updateFcmToken(
    @CurrentUser() user: JwtPayload,
    @Body() body: { token: string },
  ) {
    return this.usersService.addFcmToken(user.sub, body.token);
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
  deleteMyAddress(
    @CurrentUser() user: JwtPayload,
    @Param('index') index: string,
  ) {
    return this.usersService.deleteAddress(user.sub, Number(index));
  }

  @Patch('me/addresses/:index/default')
  setMyDefaultAddress(
    @CurrentUser() user: JwtPayload,
    @Param('index') index: string,
  ) {
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

  // Search History
  @Get('me/search-history')
  getMySearchHistory(@CurrentUser() user: JwtPayload) {
    return this.usersService.getSearchHistory(user.sub);
  }

  @Post('me/search-history')
  saveMySearchHistory(
    @CurrentUser() user: JwtPayload,
    @Body() body: { queries: string[] },
  ) {
    return this.usersService.saveSearchHistory(user.sub, body.queries || []);
  }

  @Delete('me/search-history')
  clearMySearchHistory(@CurrentUser() user: JwtPayload) {
    return this.usersService.clearSearchHistory(user.sub);
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
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.usersService.remove(id);
  }

  @Roles('admin')
  @Post(':id/address')
  addAddress(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() address: AddressDto,
  ) {
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
