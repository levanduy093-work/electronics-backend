import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { NotificationsService } from './notifications.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Body, Delete, Post } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findMine(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.findForUser(user.sub);
  }

  @Patch('read-all')
  markAll(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllRead(user.sub);
  }

  @Patch(':id/read')
  markOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificationsService.markRead(user.sub, id);
  }

  // Admin endpoints
  @Roles('admin')
  @UseGuards(RolesGuard)
  @Get('admin/all')
  findAllAdmin() {
    return this.notificationsService.adminFindAll();
  }

  @Roles('admin')
  @UseGuards(RolesGuard)
  @Post('admin')
  createAdmin(@Body() dto: CreateNotificationDto, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.adminCreate(dto, user.sub);
  }

  @Roles('admin')
  @UseGuards(RolesGuard)
  @Patch('admin/:id')
  updateAdmin(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateNotificationDto,
  ) {
    return this.notificationsService.adminUpdate(id, dto);
  }

  @Roles('admin')
  @UseGuards(RolesGuard)
  @Delete('admin/:id')
  deleteAdmin(@Param('id', ParseObjectIdPipe) id: string) {
    return this.notificationsService.adminDelete(id);
  }
}
