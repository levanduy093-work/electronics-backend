import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { Shipment, ShipmentDocument } from './schemas/shipment.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectModel(Shipment.name)
    private readonly shipmentModel: Model<ShipmentDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
  ) {}

  async create(data: CreateShipmentDto) {
    const mapped = this.mapDto(data);
    if (!mapped.expectedDelivery) {
      mapped.expectedDelivery = this.getDefaultExpectedDelivery();
    }
    if (mapped.status && (!mapped.statusHistory || mapped.statusHistory.length === 0)) {
      mapped.statusHistory = [{ status: mapped.status, at: new Date() }];
    }
    const created = await this.shipmentModel.create(mapped);
    const result = this.strip(created.toObject());
    await this.syncPaymentToOrder(result.orderId, result.paymentStatus);
    return result;
  }

  async findAll() {
    const docs = await this.shipmentModel.find().lean();
    return docs.map(this.strip);
  }

  async findByOrderId(orderId: string) {
    const doc = await this.shipmentModel.findOne({ orderId: new Types.ObjectId(orderId) }).lean();
    return doc ? this.strip(doc) : null;
  }

  async removeByOrderId(orderId: string) {
    if (!orderId) return;
    const parsedOrderId = new Types.ObjectId(orderId);
    await this.shipmentModel.deleteMany({ orderId: parsedOrderId });
  }

  async findOne(id: string) {
    const doc = await this.shipmentModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Shipment not found');
    return this.strip(doc);
  }

  async update(id: string, data: UpdateShipmentDto) {
    const existing = await this.shipmentModel.findById(id).lean();
    if (!existing) throw new NotFoundException('Shipment not found');

    const mapped = this.mapDto(data);
    const payload: any = { ...mapped };

    if (mapped.status && mapped.status !== existing.status) {
      const history = [...(existing.statusHistory || [])];
      history.push({ status: mapped.status, at: new Date() });
      payload.statusHistory = history;
    }

    const doc = await this.shipmentModel
      .findByIdAndUpdate(id, payload, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Shipment not found');
    const result = this.strip(doc);
    await this.syncPaymentToOrder(result.orderId, payload.paymentStatus ?? result.paymentStatus);
    return result;
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

  private getDefaultExpectedDelivery(baseDate: Date = new Date()) {
    const daysToAdd = 2 + Math.random(); // 2–3 days window
    const eta = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    return eta;
  }

  private async syncPaymentToOrder(orderId?: Types.ObjectId | string, paymentStatus?: string) {
    if (!orderId || !paymentStatus) return;
    const parsedOrderId = typeof orderId === 'string' ? new Types.ObjectId(orderId) : orderId;
    await this.orderModel.findByIdAndUpdate(parsedOrderId, { paymentStatus }, { lean: true }).exec();
  }

  private strip = (doc: Partial<Shipment>) => {
    const { __v, ...rest } = doc as Partial<Shipment & { __v?: number }>;
    const createdAt = (rest as any)?.createdAt;
    if (!rest.expectedDelivery && createdAt) {
      rest.expectedDelivery = this.getDefaultExpectedDelivery(new Date(createdAt));
    }
    return rest;
  };
}
