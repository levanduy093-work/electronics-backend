import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { Voucher, VoucherDocument } from './schemas/voucher.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { stripDocument } from '../common/utils/strip-doc.util';

interface EmbeddedVoucher {
  code: string;
  expire?: Date | string;
  discountPrice?: number;
  discountRate?: number;
  maxDiscountPrice?: number;
  description?: string;
}

@Injectable()
export class VouchersService {
  constructor(
    @InjectModel(Voucher.name)
    private readonly voucherModel: Model<VoucherDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(data: CreateVoucherDto) {
    const created = await this.voucherModel.create({
      ...data,
      expire: new Date(data.expire),
    });
    return stripDocument(created.toObject());
  }

  async findAll() {
    const docs = await this.voucherModel.find().lean();
    return docs.map(stripDocument);
  }

  async findAvailable() {
    const now = new Date();
    const docs = await this.voucherModel
      .find({ expire: { $gte: now } })
      .sort({ expire: 1 })
      .lean();
    return docs.map((doc) => this.stripWithDefaults(doc));
  }

  async findForUser(userId: string) {
    const now = new Date();
    const [globalVouchers, user] = await Promise.all([
      this.voucherModel
        .find({ expire: { $gte: now } })
        .sort({ expire: 1 })
        .lean(),
      this.userModel.findById(userId).select('voucher').lean(),
    ]);

    const embeddedVouchers = (user?.voucher || []) as EmbeddedVoucher[];
    const activeEmbeddedVouchers = embeddedVouchers
      .filter((v) => v.expire && new Date(v.expire) >= now)
      .map((v) => ({ ...v, _id: v.code })); // Use code as _id for embedded vouchers

    const merged = [...globalVouchers, ...activeEmbeddedVouchers];
    const seenCodes = new Set<string>();
    const unique: (Partial<Voucher> & { _id?: string })[] = [];

    for (const doc of merged) {
      const code = doc.code?.toString();
      if (!code) continue;
      if (!seenCodes.has(code)) {
        seenCodes.add(code);
        const id = (doc as any)._id;
        unique.push({
          ...doc,
          expire: doc.expire ? new Date(doc.expire) : undefined,
          _id: typeof id === 'string' ? id : id?.toString?.() || code,
        });
      }
    }

    return unique.map((doc) => this.stripWithDefaults(doc));
  }

  async findOne(id: string) {
    const doc = await this.voucherModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Voucher not found');
    return stripDocument(doc);
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
    return stripDocument(doc);
  }

  async remove(id: string) {
    const doc = await this.voucherModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Voucher not found');
    return stripDocument(doc);
  }

  private stripWithDefaults = (doc: Partial<Voucher>) => {
    const cleaned = stripDocument(doc) as Voucher & { type?: Voucher['type'] };
    const inferType = () => {
      const desc = (cleaned.description || '').toLowerCase();
      if (desc.includes('ship')) return 'shipping';
      return 'fixed';
    };
    return {
      ...cleaned,
      type: cleaned.type || inferType(),
      discountPrice: cleaned.discountPrice ?? 0,
      discountRate: cleaned.discountRate,
      maxDiscountPrice: cleaned.maxDiscountPrice,
    };
  };
}
