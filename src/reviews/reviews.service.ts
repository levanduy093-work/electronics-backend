import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtPayload } from '../common/types/jwt-payload';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { Review, ReviewDocument } from './schemas/review.schema';
import { Product } from '../products/schemas/product.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(data: CreateReviewDto, user: JwtPayload) {
    const userId = new Types.ObjectId(user.sub);
    const productId = new Types.ObjectId(data.productId);
    const userDoc = await this.userModel.findById(user.sub).lean();
    const userName = (userDoc?.name || user.email || 'Khách hàng').trim();

    const doc = await this.reviewModel
      .findOneAndUpdate(
        { userId, productId },
        {
          ...data,
          userId,
          productId,
          userName,
          images: data.images ?? [],
        },
        { new: true, upsert: true, setDefaultsOnInsert: true, lean: true },
      )
      .exec();

    await this.updateProductStats(data.productId);
    if (!doc) throw new NotFoundException('Review not found');
    return this.strip(doc);
  }

  async findAll() {
    const docs = await this.reviewModel.find().sort({ updatedAt: -1 }).lean();
    return this.attachUserNames(docs).then((items) => items.map(this.strip));
  }

  async findOne(id: string) {
    const doc = await this.reviewModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Review not found');
    const [withName] = await this.attachUserNames([doc]);
    return this.strip(withName);
  }

  async findByProduct(productId: string) {
    const docs = await this.reviewModel
      .find({ productId: new Types.ObjectId(productId) })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();
    const enriched = await this.attachUserNames(docs);
    return enriched.map(this.strip);
  }

  async update(id: string, data: UpdateReviewDto) {
    const mapped: any = { ...data };
    if (data.productId) mapped.productId = new Types.ObjectId(data.productId);
    const doc = await this.reviewModel
      .findByIdAndUpdate(id, mapped, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Review not found');
    await this.updateProductStats(
      (mapped.productId || doc.productId).toString(),
    );
    return this.strip(doc);
  }

  async remove(id: string) {
    const doc = await this.reviewModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Review not found');
    await this.updateProductStats(doc.productId.toString());
    if (!doc) throw new NotFoundException('Review not found');
    return this.strip(doc);
  }

  private strip = (doc: Partial<Review>) => {
    const { __v, ...rest } = doc as Partial<Review & { __v?: number }>;
    return rest;
  };

  private async updateProductStats(productId: string) {
    const objectId = new Types.ObjectId(productId);
    const stats = await this.reviewModel.aggregate([
      { $match: { productId: objectId } },
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
      { _id: objectId },
      {
        averageRating: summary?.avgRating ?? 0,
        reviewCount: summary?.count ?? 0,
      },
    );
  }

  private async attachUserNames(docs: Partial<Review>[]) {
    const missing = docs
      .filter((d) => !d.userName && d.userId)
      .map((d) => d.userId?.toString());
    const uniqueIds = Array.from(new Set(missing.filter(Boolean) as string[]));
    let userMap = new Map<string, string>();
    if (uniqueIds.length) {
      const users = await this.userModel
        .find({ _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) } })
        .select({ name: 1 })
        .lean();
      userMap = new Map(
        users.map((u) => [u._id.toString(), (u.name || '').trim()]),
      );
    }

    const updates: { _id: any; userName: string }[] = [];
    const enriched = docs.map((doc) => {
      const resolved =
        doc.userName?.trim() ||
        (doc.userId
          ? userMap.get((doc.userId as any)?.toString())
          : undefined) ||
        'Khách hàng';
      const anyDoc = doc as any;
      if (resolved && resolved !== doc.userName && anyDoc._id) {
        updates.push({ _id: anyDoc._id, userName: resolved });
      }
      return { ...doc, userName: resolved };
    });

    if (updates.length) {
      const bulkOps = updates.map((u) => ({
        updateOne: { filter: { _id: u._id }, update: { userName: u.userName } },
      }));
      await this.reviewModel
        .bulkWrite(bulkOps, { ordered: false })
        .catch(() => undefined);
    }

    return enriched;
  }
}
