import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryMovementsController } from './inventory-movements.controller';
import { InventoryMovementsService } from './inventory-movements.service';
import {
  InventoryMovement,
  InventoryMovementSchema,
} from './schemas/inventory-movement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InventoryMovement.name, schema: InventoryMovementSchema },
    ]),
  ],
  controllers: [InventoryMovementsController],
  providers: [InventoryMovementsService],
  exports: [InventoryMovementsService],
})
export class InventoryMovementsModule {}
