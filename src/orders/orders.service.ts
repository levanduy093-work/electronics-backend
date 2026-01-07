import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order, OrderDocument } from './schemas/order.schema';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
  ) {}

  async create(data: CreateOrderDto) {
    const payload = this.mapDto(data);
    const created = await this.orderModel.create(payload);
    return this.strip(created.toObject());
  }

  async findAll() {
    const docs = await this.orderModel.find().lean();
    return docs.map(this.strip);
  }

  async findOne(id: string) {
    const doc = await this.orderModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Order not found');
    return this.strip(doc);
  }

  async update(id: string, data: UpdateOrderDto) {
    const payload = this.mapDto(data);
    const doc = await this.orderModel
      .findByIdAndUpdate(id, payload, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Order not found');
    return this.strip(doc);
  }

  async remove(id: string) {
    const doc = await this.orderModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Order not found');
    return this.strip(doc);
  }

  private mapDto(data: Partial<CreateOrderDto>) {
    const mapped: any = { ...data };
    if (data.userId) mapped.userId = new Types.ObjectId(data.userId);
    if (data.voucher) mapped.voucher = new Types.ObjectId(data.voucher);
    if (data.items) {
      mapped.items = data.items.map((item) => ({
        ...item,
        productId: item.productId ? new Types.ObjectId(item.productId) : undefined,
      }));
    }
    if (data.status) {
      mapped.status = {
        ...data.status,
        ordered: data.status.ordered ? new Date(data.status.ordered) : data.status.ordered,
        confirmed: data.status.confirmed ? new Date(data.status.confirmed) : data.status.confirmed,
        packaged: data.status.packaged ? new Date(data.status.packaged) : data.status.packaged,
        shipped: data.status.shipped ? new Date(data.status.shipped) : data.status.shipped,
      };
    }
    return mapped;
  }

  private strip = (doc: Partial<Order>) => {
    const { __v, ...rest } = doc as Partial<Order & { __v?: number }>;
    return rest;
  };
}
