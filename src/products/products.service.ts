import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async create(data: CreateProductDto) {
    const { averageRating, reviewCount, saleCount, ...payload } = data;
    const created = await this.productModel.create(payload);
    return this.strip(created.toObject());
  }

  async findAll() {
    const docs = await this.productModel.find().lean();
    return docs.map(this.strip);
  }

  async findOne(id: string) {
    const doc = await this.productModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Product not found');
    return this.strip(doc);
  }

  async update(id: string, data: UpdateProductDto) {
    const { averageRating, reviewCount, saleCount, ...payload } = data;
    const doc = await this.productModel
      .findByIdAndUpdate(id, payload, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Product not found');
    return this.strip(doc);
  }

  async remove(id: string) {
    const doc = await this.productModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Product not found');
    return this.strip(doc);
  }

  private strip = (doc: Partial<Product>) => {
    const { __v, ...rest } = doc as Partial<Product & { __v?: number }>;
    return rest;
  };
}
