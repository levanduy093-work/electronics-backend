import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtPayload } from '../common/types/jwt-payload';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order, OrderDocument } from './schemas/order.schema';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
  ) {}

  async create(data: CreateOrderDto, user: JwtPayload) {
    const payload = this.mapDto(data, user.sub);
    const created = await this.orderModel.create(payload);
    return this.strip(created.toObject());
  }

  async findAll(user: JwtPayload) {
    const filter = user.role === 'admin' ? {} : { userId: new Types.ObjectId(user.sub) };
    const docs = await this.orderModel.find(filter).lean();
    return docs.map(this.strip);
  }

  async findOne(id: string, user: JwtPayload) {
    const doc = await this.orderModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Order not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    return this.strip(doc);
  }

  async update(id: string, data: UpdateOrderDto, user: JwtPayload) {
    const existing = await this.orderModel.findById(id).lean();
    if (!existing) throw new NotFoundException('Order not found');
    this.ensureOwnerOrAdmin(existing.userId, user);

    const payload = this.mapDto(data, existing.userId?.toString());
    const doc = await this.orderModel
      .findByIdAndUpdate(id, payload, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Order not found');
    return this.strip(doc);
  }

  async remove(id: string, user: JwtPayload) {
    const doc = await this.orderModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Order not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    await this.orderModel.findByIdAndDelete(id).lean();
    return this.strip(doc);
  }

  private mapDto(data: Partial<CreateOrderDto>, userId?: string) {
    const mapped: any = { ...data };
    if (userId) mapped.userId = new Types.ObjectId(userId);
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

  private ensureOwnerOrAdmin(ownerId: Types.ObjectId | undefined, user: JwtPayload) {
    if (user.role === 'admin') return;
    if (!ownerId || ownerId.toString() !== user.sub) {
      throw new ForbiddenException('Access denied');
    }
  }

  private strip = (doc: Partial<Order>) => {
    const { __v, ...rest } = doc as Partial<Order & { __v?: number }>;
    return rest;
  };
}
