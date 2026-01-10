import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { VouchersService } from './vouchers.service';

@Controller('vouchers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateVoucherDto) {
    return this.vouchersService.create(dto);
  }

  @Get()
  @Roles('admin')
  findAll() {
    return this.vouchersService.findAll();
  }

  @Get('available')
  findAvailable() {
    return this.vouchersService.findAvailable();
  }

  @Get('my')
  findForUser(@CurrentUser() user: JwtPayload) {
    return this.vouchersService.findForUser(user.sub);
  }

  @Get(':id')
  @Roles('admin')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.vouchersService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateVoucherDto) {
    return this.vouchersService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.vouchersService.remove(id);
  }
}
