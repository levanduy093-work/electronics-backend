import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { UpdateInventoryMovementDto } from './dto/update-inventory-movement.dto';
import {
  InventoryMovement,
  InventoryMovementDocument,
} from './schemas/inventory-movement.schema';

@Injectable()
export class InventoryMovementsService {
  constructor(
    @InjectModel(InventoryMovement.name)
    private readonly movementModel: Model<InventoryMovementDocument>,
  ) {}

  async create(data: CreateInventoryMovementDto) {
    const created = await this.movementModel.create({
      ...data,
      productId: new Types.ObjectId(data.productId),
    });
    return this.strip(created.toObject());
  }

  async findAll() {
    const docs = await this.movementModel.find().lean();
    return docs.map(this.strip);
  }

  async findOne(id: string) {
    const doc = await this.movementModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Inventory movement not found');
    return this.strip(doc);
  }

  async update(id: string, data: UpdateInventoryMovementDto) {
    const mapped: any = { ...data };
    if (data.productId) mapped.productId = new Types.ObjectId(data.productId);
    const doc = await this.movementModel
      .findByIdAndUpdate(id, mapped, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Inventory movement not found');
    return this.strip(doc);
  }

  async remove(id: string) {
    const doc = await this.movementModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Inventory movement not found');
    return this.strip(doc);
  }

  private strip = (doc: Partial<InventoryMovement>) => {
    const { __v, ...rest } = doc as Partial<InventoryMovement & { __v?: number }>;
    return rest;
  };
}
