import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtPayload } from '../common/types/jwt-payload';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { Cart, CartDocument } from './schemas/cart.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';

@Injectable()
export class CartsService {
  constructor(
    @InjectModel(Cart.name)
    private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async create(data: CreateCartDto, user: JwtPayload) {
    const items = (data.items || []).map((item) => ({
      ...item,
      productId: new Types.ObjectId(item.productId),
    }));

    const voucher = data.voucher ? new Types.ObjectId(data.voucher) : undefined;
    const totals = this.recalculate(items, data.shippingFee ?? 0);

    const created = await this.cartModel.create({
      userId: new Types.ObjectId(user.sub),
      voucher,
      items,
      ...totals,
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

    const mapped: any = {};
    if (data.voucher) mapped.voucher = new Types.ObjectId(data.voucher);

    const items = data.items
      ? data.items.map((item) => ({
          ...item,
          productId: item.productId ? new Types.ObjectId(item.productId) : undefined,
        }))
      : existing.items || [];

    const shippingFee = data.shippingFee ?? existing.shippingFee ?? 0;
    const totals = this.recalculate(items, shippingFee);
    Object.assign(mapped, { items, ...totals });

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

  async addItemForUser(user: JwtPayload, productId: string, quantity: number) {
    const product = await this.productModel.findById(productId).lean();
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const availableStock = typeof product.stock === 'number' ? product.stock : 0;
    if (availableStock <= 0) {
      throw new BadRequestException('Sản phẩm đã hết hàng');
    }

    const safeQuantity = Math.max(1, Math.floor(quantity || 1));
    const finalQuantity = Math.min(safeQuantity, availableStock);
    const filter = { userId: new Types.ObjectId(user.sub) };
    const existing = await this.cartModel.findOne(filter).lean();

    const items = existing?.items?.length ? [...existing.items] : [];
    const existingIndex = items.findIndex(
      (item) => item.productId && item.productId.toString() === productId,
    );

    const baseItem = {
      productId: new Types.ObjectId(productId),
      name: product.name,
      category: product.category || 'Khác',
      image: product.images?.[0],
      price: product.price?.salePrice ?? product.price?.originalPrice ?? 0,
      quantity: finalQuantity,
    };

    if (existingIndex >= 0) {
      const current = items[existingIndex];
      const mergedQuantity = Math.min(
        (current.quantity || 0) + finalQuantity,
        availableStock,
      );
      items[existingIndex] = { ...current, ...baseItem, quantity: mergedQuantity };
    } else {
      items.push(baseItem);
    }

    const shippingFee = existing?.shippingFee ?? 0;
    const totals = this.recalculate(items, shippingFee);

    const updated = await this.cartModel
      .findOneAndUpdate(
        filter,
        { $set: { items, ...totals } },
        { new: true, upsert: true, lean: true, setDefaultsOnInsert: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Cart not found');
    }
    return this.strip(updated);
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

  private recalculate(items: any[], shippingFee: number) {
    const subTotal = (items || []).reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0,
    );
    const totalItem = (items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalPrice = subTotal + (shippingFee || 0);
    return { shippingFee, subTotal, totalItem, totalPrice };
  }
}
