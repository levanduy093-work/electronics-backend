import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { Shipment, ShipmentDocument } from './schemas/shipment.schema';

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectModel(Shipment.name)
    private readonly shipmentModel: Model<ShipmentDocument>,
  ) {}

  async create(data: CreateShipmentDto) {
    const created = await this.shipmentModel.create(this.mapDto(data));
    return this.strip(created.toObject());
  }

  async findAll() {
    const docs = await this.shipmentModel.find().lean();
    return docs.map(this.strip);
  }

  async findOne(id: string) {
    const doc = await this.shipmentModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Shipment not found');
    return this.strip(doc);
  }

  async update(id: string, data: UpdateShipmentDto) {
    const mapped = this.mapDto(data);
    const doc = await this.shipmentModel
      .findByIdAndUpdate(id, mapped, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Shipment not found');
    return this.strip(doc);
  }

  async remove(id: string) {
    const doc = await this.shipmentModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Shipment not found');
    return this.strip(doc);
  }

  private mapDto(data: Partial<CreateShipmentDto>) {
    const mapped: any = { ...data };
    if (data.orderId) mapped.orderId = new Types.ObjectId(data.orderId);
    if (data.expectedDelivery) mapped.expectedDelivery = new Date(data.expectedDelivery);
    if (data.statusHistory) {
      mapped.statusHistory = data.statusHistory.map((entry) => ({
        ...entry,
        at: entry.at ? new Date(entry.at) : undefined,
      }));
    }
    return mapped;
  }

  private strip = (doc: Partial<Shipment>) => {
    const { __v, ...rest } = doc as Partial<Shipment & { __v?: number }>;
    return rest;
  };
}
