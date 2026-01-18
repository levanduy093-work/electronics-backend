import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBannerDto } from './dto/create-banner.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { Banner, BannerDocument } from './schemas/banner.schema';

@Injectable()
export class BannersService {
  constructor(
    @InjectModel(Banner.name)
    private readonly bannerModel: Model<BannerDocument>,
  ) {}

  async create(dto: CreateBannerDto) {
    const count = await this.bannerModel.countDocuments().exec();
    const order = typeof dto.order === 'number' ? dto.order : count;
    const banner = new this.bannerModel({ ...dto, order });
    return banner.save();
  }

  async findPublic() {
    return this.bannerModel
      .find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .lean()
      .exec();
  }

  async findAll() {
    return this.bannerModel
      .find()
      .sort({ order: 1, createdAt: -1 })
      .lean()
      .exec();
  }

  async update(id: string, dto: UpdateBannerDto) {
    const updated = await this.bannerModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Banner not found');
    }
    return updated;
  }

  async remove(id: string) {
    const deleted = await this.bannerModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException('Banner not found');
    }
    return deleted;
  }

  async reorder(dto: ReorderBannersDto) {
    const session = await this.bannerModel.db.startSession();
    try {
      await session.withTransaction(async () => {
        for (const item of dto.items) {
          await this.bannerModel
            .updateOne(
              { _id: item.id },
              { $set: { order: item.order } },
              { session },
            )
            .exec();
        }
      });
    } finally {
      await session.endSession();
    }
    return this.findAll();
  }
}
