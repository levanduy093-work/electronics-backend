import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { Cart, CartDocument } from './schemas/cart.schema';

@Injectable()
export class CartsService {
  constructor(
    @InjectModel(Cart.name)
    private readonly cartModel: Model<CartDocument>,
  ) {}

  async create(data: CreateCartDto) {
    const created = await this.cartModel.create({
      ...data,
      userId: new Types.ObjectId(data.userId),
      voucher: data.voucher ? new Types.ObjectId(data.voucher) : undefined,
      items: data.items?.map((item) => ({
        ...item,
        productId: new Types.ObjectId(item.productId),
      })),
    });
    return this.strip(created.toObject());
  }

  async findAll() {
    const docs = await this.cartModel.find().lean();
    return docs.map(this.strip);
  }

  async findOne(id: string) {
    const doc = await this.cartModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Cart not found');
    return this.strip(doc);
  }

  async update(id: string, data: UpdateCartDto) {
    const mapped: any = { ...data };
    if (data.userId) mapped.userId = new Types.ObjectId(data.userId);
    if (data.voucher) mapped.voucher = new Types.ObjectId(data.voucher);
    if (data.items) {
      mapped.items = data.items.map((item) => ({
        ...item,
        productId: item.productId ? new Types.ObjectId(item.productId) : undefined,
      }));
    }

    const doc = await this.cartModel
      .findByIdAndUpdate(id, mapped, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Cart not found');
    return this.strip(doc);
  }

  async remove(id: string) {
    const doc = await this.cartModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Cart not found');
    return this.strip(doc);
  }

  private strip = (doc: Partial<Cart>) => {
    const { __v, ...rest } = doc as Partial<Cart & { __v?: number }>;
    return rest;
  };
}
