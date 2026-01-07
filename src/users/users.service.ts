import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddressDto } from './dto/address.dto';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(data: CreateUserDto) {
    const passwordHash = await this.resolvePassword(data.password, data.passwordHashed);
    const created = await this.userModel.create({ ...data, passwordHashed: passwordHash });
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
    if (data.password || data.passwordHashed) {
      patch.passwordHashed = await this.resolvePassword(data.password, data.passwordHashed);
    }
    const updated = await this.userModel
      .findByIdAndUpdate(id, patch, { new: true, lean: true })
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
    user.address.push(address);
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

  private toSafeUser = (user: Partial<User>) => {
    // Hide password hash when returning to clients.
    const { passwordHashed, __v, ...rest } = user as Partial<User & { __v?: number }>;
    return rest;
  };

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).lean();
  }

  async comparePassword(user: Partial<User>, plain: string) {
    if (!user?.passwordHashed) {
      return false;
    }
    return bcrypt.compare(plain, user.passwordHashed);
  }

  private async resolvePassword(password?: string, passwordHashed?: string) {
    if (password) {
      return bcrypt.hash(password, 10);
    }
    if (passwordHashed) {
      const looksHashed = passwordHashed.startsWith('$2b$') || passwordHashed.startsWith('$2a$');
      if (!looksHashed) {
        throw new BadRequestException('passwordHashed must be bcrypt-hashed');
      }
      return passwordHashed;
    }
    throw new BadRequestException('Password is required');
  }
}
