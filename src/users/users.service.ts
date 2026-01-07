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

  private async hashPassword(password?: string) {
    if (password) {
      return bcrypt.hash(password, 10);
    }
    throw new BadRequestException('Password is required');
  }
}
