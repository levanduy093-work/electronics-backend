import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { Voucher, VoucherDocument } from './schemas/voucher.schema';

@Injectable()
export class VouchersService {
  constructor(
    @InjectModel(Voucher.name)
    private readonly voucherModel: Model<VoucherDocument>,
  ) {}

  async create(data: CreateVoucherDto) {
    const created = await this.voucherModel.create({
      ...data,
      expire: new Date(data.expire),
    });
    return this.strip(created.toObject());
  }

  async findAll() {
    const docs = await this.voucherModel.find().lean();
    return docs.map(this.strip);
  }

  async findOne(id: string) {
    const doc = await this.voucherModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Voucher not found');
    return this.strip(doc);
  }

  async update(id: string, data: UpdateVoucherDto) {
    const doc = await this.voucherModel
      .findByIdAndUpdate(
        id,
        data.expire ? { ...data, expire: new Date(data.expire) } : data,
        { new: true, lean: true },
      )
      .exec();
    if (!doc) throw new NotFoundException('Voucher not found');
    return this.strip(doc);
  }

  async remove(id: string) {
    const doc = await this.voucherModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Voucher not found');
    return this.strip(doc);
  }

  private strip = (doc: Partial<Voucher>) => {
    const { __v, ...rest } = doc as Partial<Voucher & { __v?: number }>;
    return rest;
  };
}
