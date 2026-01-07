import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { Review, ReviewDocument } from './schemas/review.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
  ) {}

  async create(data: CreateReviewDto) {
    const created = await this.reviewModel.create({
      ...data,
      productId: new Types.ObjectId(data.productId),
    });
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

  async update(id: string, data: UpdateReviewDto) {
    const mapped: any = { ...data };
    if (data.productId) mapped.productId = new Types.ObjectId(data.productId);
    const doc = await this.reviewModel
      .findByIdAndUpdate(id, mapped, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Review not found');
    return this.strip(doc);
  }

  async remove(id: string) {
    const doc = await this.reviewModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Review not found');
    return this.strip(doc);
  }

  private strip = (doc: Partial<Review>) => {
    const { __v, ...rest } = doc as Partial<Review & { __v?: number }>;
    return rest;
  };
}
