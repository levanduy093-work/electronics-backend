import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddressDto } from './dto/address.dto';
import { User, UserDocument } from './schemas/user.schema';
import { CreateVoucherDto } from '../vouchers/dto/create-voucher.dto';
import { Product } from '../products/schemas/product.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
  ) { }

  async addVoucher(id: string, voucherData: CreateVoucherDto) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const newVoucher = {
      ...voucherData,
      expire: new Date(voucherData.expire),
      discountPrice: voucherData.discountPrice || 0,
      minTotal: voucherData.minTotal || 0,
    };
    await this.userModel.updateOne(
      { _id: id },
      { $push: { voucher: newVoucher } }
    );
    return this.findOne(id);
  }

  async create(data: CreateUserDto) {
    const passwordHash = await this.hashPassword(data.password);
    const { password, ...rest } = data;
    const created = await this.userModel.create({ ...rest, passwordHashed: passwordHash });
    return this.toSafeUser(created.toObject());
  }

  async createWithHashedPassword(data: Omit<CreateUserDto, 'password'> & { passwordHashed: string }) {
    const created = await this.userModel.create({ ...data });
    return this.toSafeUser(created.toObject());
  }

  async findAll() {
    const users = await this.userModel.find().lean();
    return users.map(this.toSafeUser);
  }

  async findOne(id: string) {
    const user = await this.userModel.findById(id).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toSafeUser(user);
  }

  async update(id: string, data: UpdateUserDto) {
    const patch: any = { ...data };
    if (data.password) {
      patch.passwordHashed = await this.hashPassword(data.password);
    }
    delete patch.password;
    const updated = await this.userModel
      .findByIdAndUpdate(id, patch, { new: true, lean: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    return this.toSafeUser(updated);
  }

  async updateSelf(id: string, data: UpdateUserDto) {
    const allowed: Partial<UpdateUserDto> = {};
    if (data.name !== undefined) allowed.name = data.name;
    if (data.avatar !== undefined) allowed.avatar = data.avatar;
    if (data.email !== undefined) allowed.email = data.email;

    const updated = await this.userModel
      .findByIdAndUpdate(id, allowed, { new: true, lean: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    return this.toSafeUser(updated);
  }

  async remove(id: string) {
    const deleted = await this.userModel.findByIdAndDelete(id).lean();
    if (!deleted) {
      throw new NotFoundException('User not found');
    }
    return this.toSafeUser(deleted);
  }

  async addAddress(id: string, address: AddressDto) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (address.isDefault) {
      user.address = user.address.map((addr) => ({ ...addr, isDefault: false }));
    }
    user.address.push({
      ...address,
      isDefault: address.isDefault ?? false,
    });
    await user.save();
    return this.toSafeUser(user.toObject());
  }

  async setDefaultAddress(id: string, index: number) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (index < 0 || index >= user.address.length) {
      throw new NotFoundException('Address not found');
    }

    user.address = user.address.map((addr, idx) => ({
      ...addr,
      isDefault: idx === index,
    }));
    await user.save();
    return this.toSafeUser(user.toObject());
  }

  async updateAddress(id: string, index: number, address: AddressDto) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (index < 0 || index >= user.address.length) {
      throw new NotFoundException('Address not found');
    }

    if (address.isDefault) {
      user.address = user.address.map((addr, idx) => ({
        ...addr,
        isDefault: idx === index,
      }));
    }
    user.address[index] = {
      ...address,
      isDefault: address.isDefault ?? user.address[index].isDefault,
    };
    await user.save();
    return this.toSafeUser(user.toObject());
  }

  async deleteAddress(id: string, index: number) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (index < 0 || index >= user.address.length) {
      throw new NotFoundException('Address not found');
    }

    user.address.splice(index, 1);
    await user.save();
    return this.toSafeUser(user.toObject());
  }

  async getUserAddresses(id: string) {
    const user = await this.userModel.findById(id).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.address || [];
  }

  async getFavorites(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .populate({ path: 'favorites', model: this.productModel })
      .lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const favorites = (user.favorites as any[]) || [];
    return favorites.map(this.stripProduct);
  }

  async addFavorite(userId: string, productId: string) {
    const productExists = await this.productModel.exists({ _id: productId });
    if (!productExists) {
      throw new NotFoundException('Product not found');
    }
    await this.userModel.updateOne(
      { _id: userId },
      { $addToSet: { favorites: productId } },
      { upsert: false },
    );
    return this.getFavorites(userId);
  }

  async addFcmToken(userId: string, token: string) {
    if (!token) return;
    await this.userModel.updateOne(
      { _id: userId },
      { $addToSet: { fcmTokens: token } },
    );
    return { success: true };
  }

  async removeFavorite(userId: string, productId: string) {
    await this.userModel.updateOne(
      { _id: userId },
      { $pull: { favorites: productId } },
      { upsert: false },
    );
    return this.getFavorites(userId);
  }

  // Search History methods
  async getSearchHistory(userId: string) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Xử lý trường hợp field searchHistory chưa tồn tại trong documents cũ
    const searchHistory = (user as any).searchHistory;
    return {
      queries: Array.isArray(searchHistory) ? searchHistory : [],
      updatedAt: (user as any).updatedAt,
    };
  }

  async saveSearchHistory(userId: string, queries: string[]) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    // Giới hạn 20 queries mới nhất
    const limitedQueries = queries.slice(0, 20);
    
    // Đảm bảo field searchHistory tồn tại (cho các documents cũ)
    if (!user.searchHistory) {
      user.searchHistory = [];
    }
    
    user.searchHistory = limitedQueries;
    await user.save();
    
    return {
      queries: user.searchHistory || [],
      updatedAt: (user as any).updatedAt,
    };
  }

  async clearSearchHistory(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    // Đảm bảo field searchHistory tồn tại (cho các documents cũ)
    if (!user.searchHistory) {
      user.searchHistory = [];
    } else {
      user.searchHistory = [];
    }
    await user.save();
    
    return { success: true };
  }

  private toSafeUser = (user: Partial<User>) => {
    // Hide password hash when returning to clients.
    const { passwordHashed, __v, ...rest } = user as Partial<User & { __v?: number }>;
    return rest;
  };

  async findByIdRaw(id: string) {
    return this.userModel.findById(id).lean();
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).lean();
  }

  async comparePassword(user: Partial<User>, plain: string) {
    if (!user?.passwordHashed) {
      return false;
    }
    return bcrypt.compare(plain, user.passwordHashed);
  }

  async updatePasswordByEmail(email: string, newPassword: string) {
    const user = await this.userModel.findOne({ email }).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.passwordHashed = await this.hashPassword(newPassword);
    await user.save();
    return this.toSafeUser(user.toObject());
  }

  private stripProduct = (product: any) => {
    if (!product) return product;
    const { __v, ...rest } = product as any;
    return rest;
  };

  private async hashPassword(password?: string) {
    if (password) {
      return bcrypt.hash(password, 10);
    }
    throw new BadRequestException('Password is required');
  }
}
