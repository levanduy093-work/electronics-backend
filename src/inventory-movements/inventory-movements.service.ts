import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { UpdateInventoryMovementDto } from './dto/update-inventory-movement.dto';
import {
  InventoryMovement,
  InventoryMovementDocument,
} from './schemas/inventory-movement.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { stripDocument } from '../common/utils/strip-doc.util';

@Injectable()
export class InventoryMovementsService {
  constructor(
    @InjectModel(InventoryMovement.name)
    private readonly movementModel: Model<InventoryMovementDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async create(data: CreateInventoryMovementDto) {
    const product = await this.productModel.findById(data.productId);
    if (!product) throw new NotFoundException('Product not found');

    const delta = this.toDelta(data.type, data.quantity);
    const nextStock = (product.stock ?? 0) + delta;
    if (nextStock < 0) {
      throw new BadRequestException('Không đủ tồn kho để xuất kho');
    }
    await this.productModel.findByIdAndUpdate(product._id, {
      stock: nextStock,
    });

    const created = await this.movementModel.create({
      ...data,
      productId: new Types.ObjectId(data.productId),
    });
    return this.normalizeDocument(stripDocument(created.toObject()));
  }

  async findAll() {
    const docs = await this.movementModel.find().lean();
    return docs.map((doc) => this.normalizeDocument(stripDocument(doc)));
  }

  async findOne(id: string) {
    const doc = await this.movementModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Inventory movement not found');
    return this.normalizeDocument(stripDocument(doc));
  }

  async update(id: string, data: UpdateInventoryMovementDto) {
    const existing = await this.movementModel.findById(id);
    if (!existing) throw new NotFoundException('Inventory movement not found');

    const nextProductId = data.productId
      ? new Types.ObjectId(data.productId)
      : existing.productId;
    const nextType = data.type ?? existing.type;
    const nextQuantity = data.quantity ?? existing.quantity;

    await this.applyStockDiff({
      prevProductId: existing.productId,
      prevType: existing.type,
      prevQuantity: existing.quantity,
      nextProductId,
      nextType,
      nextQuantity,
    });

    const mapped: any = { ...data };
    if (data.productId) mapped.productId = nextProductId;
    const doc = await this.movementModel
      .findByIdAndUpdate(id, mapped, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Inventory movement not found');
    return this.normalizeDocument(stripDocument(doc));
  }

  async remove(id: string) {
    const doc = await this.movementModel.findById(id);
    if (!doc) throw new NotFoundException('Inventory movement not found');

    const delta = this.toDelta(doc.type, doc.quantity);
    const product = await this.productModel.findById(doc.productId);
    if (!product) throw new NotFoundException('Product not found');

    const nextStock = (product.stock ?? 0) - delta;
    if (nextStock < 0) {
      throw new BadRequestException('Không thể xóa phiếu kho vì tồn kho sẽ âm');
    }
    await this.productModel.findByIdAndUpdate(product._id, {
      stock: nextStock,
    });

    const removed = await this.movementModel.findByIdAndDelete(id).lean();
    if (!removed) throw new NotFoundException('Inventory movement not found');
    return this.normalizeDocument(stripDocument(removed));
  }

  private normalizeDocument(doc: Partial<InventoryMovement> & { _id?: Types.ObjectId | string; createdAt?: Date | string; updatedAt?: Date | string }) {
    const stringifyId = (value?: Types.ObjectId | string) =>
      value && typeof value !== 'string' && 'toString' in value
        ? value.toString()
        : value;
    const normalizeDate = (value?: Date | string) =>
      value ? new Date(value).toISOString() : undefined;

    return {
      ...doc,
      _id: stringifyId(doc._id),
      productId: stringifyId(doc.productId as Types.ObjectId | string | undefined),
      createdAt: normalizeDate(doc.createdAt),
      updatedAt: normalizeDate(doc.updatedAt),
    };
  }

  private toDelta(type: string, quantity: number) {
    return type === 'inbound' ? quantity : -quantity;
  }

  private async applyStockDiff(params: {
    prevProductId: Types.ObjectId;
    prevType: string;
    prevQuantity: number;
    nextProductId: Types.ObjectId;
    nextType: string;
    nextQuantity: number;
  }) {
    const {
      prevProductId,
      prevType,
      prevQuantity,
      nextProductId,
      nextType,
      nextQuantity,
    } = params;
    const prevDelta = this.toDelta(prevType, prevQuantity);
    const nextDelta = this.toDelta(nextType, nextQuantity);

    const prevIdStr = prevProductId.toString();
    const nextIdStr = nextProductId.toString();

    if (prevIdStr === nextIdStr) {
      const product = await this.productModel.findById(prevProductId);
      if (!product) throw new NotFoundException('Product not found');
      const baseStock = (product.stock ?? 0) - prevDelta;
      const candidate = baseStock + nextDelta;
      if (candidate < 0) {
        throw new BadRequestException('Không đủ tồn kho để xuất kho');
      }
      await this.productModel.findByIdAndUpdate(prevProductId, {
        stock: candidate,
      });
      return;
    }

    const prevProduct = await this.productModel.findById(prevProductId);
    if (!prevProduct) throw new NotFoundException('Product not found');
    const revertedStock = (prevProduct.stock ?? 0) - prevDelta;
    if (revertedStock < 0) {
      throw new BadRequestException(
        'Không thể cập nhật phiếu kho vì tồn kho sẽ âm',
      );
    }

    const nextProduct = await this.productModel.findById(nextProductId);
    if (!nextProduct) throw new NotFoundException('Product not found');
    const nextCandidate = (nextProduct.stock ?? 0) + nextDelta;
    if (nextCandidate < 0) {
      throw new BadRequestException('Không đủ tồn kho để xuất kho');
    }

    await this.productModel.findByIdAndUpdate(prevProductId, {
      stock: revertedStock,
    });
    await this.productModel.findByIdAndUpdate(nextProductId, {
      stock: nextCandidate,
    });
  }
}
