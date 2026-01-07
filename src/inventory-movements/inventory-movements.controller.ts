import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { UpdateInventoryMovementDto } from './dto/update-inventory-movement.dto';
import { InventoryMovementsService } from './inventory-movements.service';

@Controller('inventory-movements')
@UseGuards(JwtAuthGuard)
export class InventoryMovementsController {
  constructor(private readonly movementsService: InventoryMovementsService) {}

  @Post()
  create(@Body() dto: CreateInventoryMovementDto) {
    return this.movementsService.create(dto);
  }

  @Get()
  findAll() {
    return this.movementsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.movementsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateInventoryMovementDto,
  ) {
    return this.movementsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.movementsService.remove(id);
  }
}
