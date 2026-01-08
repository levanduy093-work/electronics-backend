import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtPayload } from '../common/types/jwt-payload';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { Review, ReviewDocument } from './schemas/review.schema';
import { Product } from '../products/schemas/product.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
  ) {}

  async create(data: CreateReviewDto, user: JwtPayload) {
    const created = await this.reviewModel.create({
      ...data,
      userId: new Types.ObjectId(user.sub),
      productId: new Types.ObjectId(data.productId),
    });
    await this.updateProductStats(data.productId);
    return this.strip(created.toObject());
  }

  async findAll() {
    const docs = await this.reviewModel.find().lean();
    return docs.map(this.strip);
  }

  async findOne(id: string) {
    const doc = await this.reviewModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Review not found');
    return this.strip(doc);
  }

  async findByProduct(productId: string) {
    const docs = await this.reviewModel
      .find({ productId: new Types.ObjectId(productId) })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map(this.strip);
  }

  async update(id: string, data: UpdateReviewDto) {
    const mapped: any = { ...data };
    if (data.productId) mapped.productId = new Types.ObjectId(data.productId);
    const doc = await this.reviewModel
      .findByIdAndUpdate(id, mapped, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Review not found');
    await this.updateProductStats((mapped.productId || doc.productId).toString());
    return this.strip(doc);
  }

  async remove(id: string) {
    const doc = await this.reviewModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Review not found');
    await this.updateProductStats(doc.productId.toString());
    return this.strip(doc);
  }

  private strip = (doc: Partial<Review>) => {
    const { __v, ...rest } = doc as Partial<Review & { __v?: number }>;
    return rest;
  };

  private async updateProductStats(productId: string) {
    const stats = await this.reviewModel.aggregate([
      { $match: { productId: new Types.ObjectId(productId) } },
      {
        $group: {
          _id: '$productId',
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    const summary = stats[0];
    await this.productModel.updateOne(
      { _id: productId },
      {
        averageRating: summary?.avgRating ?? 0,
        reviewCount: summary?.count ?? 0,
      },
    );
  }
}
