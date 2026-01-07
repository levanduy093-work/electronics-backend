import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtPayload } from '../common/types/jwt-payload';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { Cart, CartDocument } from './schemas/cart.schema';

@Injectable()
export class CartsService {
  constructor(
    @InjectModel(Cart.name)
    private readonly cartModel: Model<CartDocument>,
  ) {}

  async create(data: CreateCartDto, user: JwtPayload) {
    const created = await this.cartModel.create({
      ...data,
      userId: new Types.ObjectId(user.sub),
      voucher: data.voucher ? new Types.ObjectId(data.voucher) : undefined,
      items: data.items?.map((item) => ({
        ...item,
        productId: new Types.ObjectId(item.productId),
      })),
    });
    return this.strip(created.toObject());
  }

  async findAll(user: JwtPayload) {
    const filter = user.role === 'admin' ? {} : { userId: new Types.ObjectId(user.sub) };
    const docs = await this.cartModel.find(filter).lean();
    return docs.map(this.strip);
  }

  async findOne(id: string, user: JwtPayload) {
    const doc = await this.cartModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Cart not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    return this.strip(doc);
  }

  async update(id: string, data: UpdateCartDto, user: JwtPayload) {
    const existing = await this.cartModel.findById(id).lean();
    if (!existing) throw new NotFoundException('Cart not found');
    this.ensureOwnerOrAdmin(existing.userId, user);

    const mapped: any = { ...data };
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

  async remove(id: string, user: JwtPayload) {
    const doc = await this.cartModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Cart not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    await this.cartModel.findByIdAndDelete(id).lean();
    return this.strip(doc);
  }

  private ensureOwnerOrAdmin(ownerId: Types.ObjectId | undefined, user: JwtPayload) {
    if (user.role === 'admin') return;
    if (!ownerId || ownerId.toString() !== user.sub) {
      throw new ForbiddenException('Access denied');
    }
  }

  private strip = (doc: Partial<Cart>) => {
    const { __v, ...rest } = doc as Partial<Cart & { __v?: number }>;
    return rest;
  };
}
