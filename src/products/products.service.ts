import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product, ProductDocument } from './schemas/product.schema';
import { EventsGateway } from '../events/events.gateway';
import { stripDocument } from '../common/utils/strip-doc.util';

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);

  private cleanImages(images?: string[]) {
    if (!images || !images.length) return [];
    return images.map((url) => (url || '').trim()).filter(Boolean);
  }

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  onModuleInit() {
    try {
      const changeStream = this.productModel.watch();
      changeStream.on('change', async (change) => {
        // Chỉ xử lý các thay đổi dạng update, insert, delete
        if (
          ['insert', 'update', 'replace', 'delete'].includes(
            change.operationType,
          )
        ) {
          this.logger.log(`Detected DB Change: ${change.operationType}`);

          // Với direct DB update, ta có thể không lấy được full document ngay
          // Nên ta bắn một sự kiện chung hoặc cố gắng lấy documentId
          let productId = null;
          if ('documentKey' in change) {
            productId = change.documentKey._id;
          }

          if (productId) {
            const doc = await this.productModel.findById(productId).lean();
            if (doc) {
              this.eventsGateway.emitProductUpdated(stripDocument(doc));
            }
          }
        }
      });

      changeStream.on('error', (error) => {
        // Change Stream yêu cầu Replica Set. Bỏ qua nếu là Standalone.
        this.logger.warn(
          'MongoDB Change Stream error (Replica Set required?): ' +
            error.message,
        );
      });

      this.logger.log('MongoDB Change Stream initialized');
    } catch (error) {
      this.logger.warn(
        'Could not initialize MongoDB Change Stream: ' + error.message,
      );
    }
  }

  async create(data: CreateProductDto) {
    const { averageRating, reviewCount, saleCount, ...payload } = data;
    if (payload.images) {
      payload.images = this.cleanImages(payload.images);
    }
    const created = await this.productModel.create(payload);
    return stripDocument(created.toObject());
  }

  async findAll() {
    const docs = await this.productModel
      .aggregate([
        ...this.buildReviewStatsPipeline(),
        { $project: { reviewStats: 0 } },
      ])
      .exec();

    return docs.map(stripDocument);
  }

  async findOne(id: string) {
    const docs = await this.productModel
      .aggregate([
        { $match: { _id: new Types.ObjectId(id) } },
        ...this.buildReviewStatsPipeline(),
        { $project: { reviewStats: 0 } },
      ])
      .exec();

    const doc = docs[0];
    if (!doc) throw new NotFoundException('Product not found');
    return stripDocument(doc);
  }

  async findRelated(id: string) {
    const product = await this.productModel.findById(id).lean();

    const pipeline: any[] = [
      { $match: { _id: { $ne: new Types.ObjectId(id) } } },
    ];

    if (product?.category) {
      pipeline.push({ $match: { category: product.category } });
    }

    pipeline.push({ $limit: 6 });
    pipeline.push(...this.buildReviewStatsPipeline());
    pipeline.push({ $project: { reviewStats: 0 } });

    let docs = await this.productModel.aggregate(pipeline).exec();

    if (docs.length < 4) {
      const excludeIds = [new Types.ObjectId(id), ...docs.map((d) => d._id)];
      const morePipeline = [
        { $match: { _id: { $nin: excludeIds } } },
        { $limit: 6 - docs.length },
        ...this.buildReviewStatsPipeline(),
        { $project: { reviewStats: 0 } },
      ];
      const more = await this.productModel.aggregate(morePipeline).exec();
      docs = [...docs, ...more];
    }

    // If still empty (e.g., product not found or no others), fall back to latest products
    if (!docs.length) {
      docs = await this.productModel
        .aggregate([
          { $match: { _id: { $ne: new Types.ObjectId(id) } } },
          { $sort: { createdAt: -1 } },
          { $limit: 6 },
          ...this.buildReviewStatsPipeline(),
          { $project: { reviewStats: 0 } },
        ])
        .exec();
    }

    return docs.map(stripDocument);
  }

  async update(id: string, data: UpdateProductDto) {
    const { averageRating, reviewCount, saleCount, ...payload } = data;
    if (payload.images) {
      payload.images = this.cleanImages(payload.images);
    }
    const doc = await this.productModel
      .findByIdAndUpdate(id, payload, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Product not found');

    // Emit event when product is updated
    this.eventsGateway.emitProductUpdated(stripDocument(doc));

    return stripDocument(doc);
  }

  async remove(id: string) {
    const doc = await this.productModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Product not found');
    return stripDocument(doc);
  }

  private buildReviewStatsPipeline() {
    return [
      {
        $lookup: {
          from: 'reviews',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$productId', '$$productId'] },
              },
            },
            {
              $group: {
                _id: '$productId',
                avgRating: { $avg: '$rating' },
                count: { $sum: 1 },
              },
            },
          ],
          as: 'reviewStats',
        },
      },
      {
        $addFields: {
          averageRating: {
            $ifNull: [{ $arrayElemAt: ['$reviewStats.avgRating', 0] }, 0],
          },
          reviewCount: {
            $ifNull: [{ $arrayElemAt: ['$reviewStats.count', 0] }, 0],
          },
        },
      },
    ];
  }
}
