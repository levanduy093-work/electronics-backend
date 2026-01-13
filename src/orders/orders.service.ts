import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { JwtPayload } from '../common/types/jwt-payload';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order, OrderDocument } from './schemas/order.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { Transaction, TransactionDocument } from '../transactions/schemas/transaction.schema';
import { ShipmentsService } from '../shipments/shipments.service';
import { ProductsService } from '../products/products.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly transactionsService: TransactionsService,
    private readonly shipmentsService: ShipmentsService,
    private readonly productsService: ProductsService,
  ) {}

  async create(data: CreateOrderDto, user: JwtPayload) {
    console.log('[OrdersService.create] Starting order creation', { userId: user.sub, itemsCount: data.items?.length });
    const payload = this.mapDto(data, user.sub);
    
    // Deduct stock and create order atomically to avoid overselling
    const session = await this.orderModel.db.startSession();
    let createdObj: Partial<Order> | null = null;

    try {
      await session.withTransaction(async () => {
        console.log('[OrdersService.create] Starting transaction - deducting stock');
        await this.deductProductStock(payload.items, session);
        console.log('[OrdersService.create] Stock deducted successfully, creating order');

        const [created] = await this.orderModel.create([payload], { session });
        createdObj = this.strip(created.toObject());
        console.log('[OrdersService.create] Order created:', createdObj?.code);
      });
    } catch (error: any) {
      console.error('[OrdersService.create] Transaction error:', error?.message);
      // Fallback for environments without replica set transactions
      const isTxnUnavailable =
        error?.code === 20 ||
        `${error?.message || ''}`.toLowerCase().includes('replica set') ||
        `${error?.message || ''}`.toLowerCase().includes('transaction');

      if (!isTxnUnavailable) {
        console.error('[OrdersService.create] Not a transaction error, throwing', error?.message);
        throw error;
      }

      console.log('[OrdersService.create] Falling back to non-transaction mode');
      await this.deductProductStock(payload.items);
      const created = await this.orderModel.create(payload);
      createdObj = this.strip(created.toObject());
    } finally {
      await session.endSession();
    }

    if (!createdObj) {
      throw new BadRequestException('Không thể tạo đơn hàng');
    }

    if (this.isCodPayment(createdObj.payment)) {
      await this.syncCodTransaction(createdObj);
    }

    return createdObj;
  }

  async findAll(user: JwtPayload) {
    const filter = user.role === 'admin' ? {} : { userId: new Types.ObjectId(user.sub) };
    const docs = await this.orderModel.find(filter).lean();
    // Đồng bộ giao dịch COD nếu bị thiếu (tránh mất transaction do client gửi chuỗi payment khác chuẩn)
    const codOrders = docs.filter((o) => this.isCodPayment(o.payment));
    await Promise.all(codOrders.map((o) => this.syncCodTransaction(o)));
    return docs.map(this.strip);
  }

  async findOne(id: string, user: JwtPayload) {
    const doc = await this.orderModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Order not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    return this.strip(doc);
  }

  async update(id: string, data: UpdateOrderDto, user: JwtPayload) {
    const existing = await this.orderModel.findById(id).lean();
    if (!existing) throw new NotFoundException('Order not found');
    this.ensureOwnerOrAdmin(existing.userId, user);

    const isCancelling = data.isCancelled === true;
    const isStatusReset = this.isStatusReset(data.status);

    const payload = this.mapDto(data, existing.userId?.toString());

    if (isCancelling) {
      payload.paymentStatus = payload.paymentStatus || 'cancelled';
    }

    if (isStatusReset) {
      const orderedAt = existing.status?.ordered || (existing as any).createdAt;
      payload.status = orderedAt ? { ordered: new Date(orderedAt) } : {};
      payload.isCancelled = false;
      if ((existing.paymentStatus || '').toLowerCase() === 'cancelled') {
        payload.paymentStatus = 'pending';
      }
    }

    const doc = await this.orderModel
      .findByIdAndUpdate(id, payload, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Order not found');
    const updated = this.strip(doc);

    if (this.isCodPayment(updated.payment)) {
      await this.syncCodTransaction(updated);
    }

    const shouldRemoveShipments = isCancelling || isStatusReset;
    if (shouldRemoveShipments) {
      await this.shipmentsService.removeByOrderId(id);
    }

    const wasShipped = Boolean(existing.status?.shipped);
    const isNowShipped = Boolean(updated.status?.shipped);
    if (!updated.isCancelled && isNowShipped) {
      await this.ensureShipmentExists(updated, wasShipped);
    }

    return updated;
  }

  async rollback(id: string, user: JwtPayload) {
    return this.update(
      id,
      {
        status: {},
        isCancelled: false,
      } as UpdateOrderDto,
      user,
    );
  }

  async cancel(id: string, user: JwtPayload) {
    // Get order details before cancelling to restore stock
    const order = await this.orderModel.findById(id).lean();
    if (!order) throw new NotFoundException('Order not found');
    
    // Only restore stock if order is not already cancelled
    if (!order.isCancelled) {
      await this.restoreProductStock(order.items);
    }
    
    return this.update(
      id,
      {
        isCancelled: true,
        paymentStatus: 'cancelled',
      } as UpdateOrderDto,
      user,
    );
  }

  async remove(id: string, user: JwtPayload) {
    const doc = await this.orderModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Order not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    await this.orderModel.findByIdAndDelete(id).lean();
    return this.strip(doc);
  }

  private mapDto(data: Partial<CreateOrderDto>, userId?: string) {
    const mapped: any = { ...data };
    if (data.payment) {
      mapped.payment = this.normalizePayment(data.payment);
    }
    if (userId) mapped.userId = new Types.ObjectId(userId);
    if (data.voucher) mapped.voucher = new Types.ObjectId(data.voucher);
    if (data.items) {
      mapped.items = data.items.map((item) => ({
        ...item,
        productId: item.productId ? new Types.ObjectId(item.productId) : undefined,
      }));
    }
    if (data.status) {
      mapped.status = {
        ...data.status,
        ordered: data.status.ordered ? new Date(data.status.ordered) : data.status.ordered,
        confirmed: data.status.confirmed ? new Date(data.status.confirmed) : data.status.confirmed,
        packaged: data.status.packaged ? new Date(data.status.packaged) : data.status.packaged,
        shipped: data.status.shipped ? new Date(data.status.shipped) : data.status.shipped,
      };
    }
    return mapped;
  }

  private isStatusReset(status?: UpdateOrderDto['status']) {
    if (!status) return false;
    return !status.ordered && !status.confirmed && !status.packaged && !status.shipped;
  }

  private ensureOwnerOrAdmin(ownerId: Types.ObjectId | undefined, user: JwtPayload) {
    if (user.role === 'admin') return;
    if (!ownerId || ownerId.toString() !== user.sub) {
      throw new ForbiddenException('Access denied');
    }
  }

  private strip = (doc: Partial<Order>) => {
    const { __v, ...rest } = doc as Partial<Order & { __v?: number }>;
    return rest;
  };

  private normalizePayment(payment?: string | null) {
    const p = (payment || '').trim();
    if (!p) return p;
    const lower = p.toLowerCase();
    if (lower.includes('cod') || lower.includes('cash')) return 'cod';
    if (lower.includes('vnpay')) return 'vnpay';
    return p;
  }

  private isCodPayment(payment?: string | null) {
    const normalized = this.normalizePayment(payment);
    return (normalized || '').toLowerCase() === 'cod';
  }

  private async syncCodTransaction(order: Partial<Order>) {
    const orderId = (order as any)._id?.toString?.();
    const userId = (order as any).userId?.toString?.();
    if (!orderId || !userId) return;

    const status = order.paymentStatus || 'pending';
    const amount = (order as any).totalPrice || 0;

    const existing = await this.transactionModel
      .findOne({ orderId: new Types.ObjectId(orderId), provider: 'cod' })
      .lean();

    const paidAtUpdate = status === 'paid' ? { paidAt: new Date().toISOString() } : {};

    if (existing?._id) {
      await this.transactionModel
        .findByIdAndUpdate(existing._id, { status, ...paidAtUpdate }, { lean: true })
        .exec();
    } else {
      await this.transactionsService.create({
        orderId,
        userId,
        provider: 'cod',
        amount,
        currency: 'VND',
        status,
        ...paidAtUpdate,
      });
    }
  }

  private async ensureShipmentExists(order: Partial<Order>, wasShipped: boolean) {
    const orderId = (order as any)._id?.toString?.();
    if (!orderId) return;
    const existingShipment = await this.shipmentsService.findByOrderId(orderId);
    if (existingShipment) return existingShipment;

    const paymentMethod = this.normalizePayment(order.payment);
    const defaultStatus = wasShipped ? 'delivered' : 'in_transit';

    return this.shipmentsService.create({
      orderId,
      carrier: 'Nội bộ',
      trackingNumber: order.code || orderId,
      status: defaultStatus,
      statusHistory: [{ status: defaultStatus, at: new Date().toISOString() }],
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
    });
  }

  private async deductProductStock(items: any[], session?: ClientSession) {
    if (!items || items.length === 0) {
      console.log('[deductProductStock] No items to deduct');
      return;
    }

    console.log('[deductProductStock] Starting stock deduction for', items.length, 'items');
    // Ensure we handle session correctly (pass undefined if null/undefined)
    const options = session ? { session } : {};
    const updatedItems: { productId: Types.ObjectId; quantity: number }[] = [];

    try {
      for (const item of items) {
        if (!item.productId || !item.quantity || item.quantity <= 0) {
          continue;
        }

        const productId =
          item.productId instanceof Types.ObjectId
            ? item.productId
            : new Types.ObjectId(item.productId);

        // Use atomic updateOne with generic session handling
        // We check stock >= quantity in the query condition
        const result = await this.productModel.updateOne(
          { _id: productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity, saleCount: item.quantity } },
          options,
        );

        // If modifiedCount is 0, it means either product not found OR condition (stock >= quantity) failed
        if (result.modifiedCount !== 1) {
          console.error('[deductProductStock] Update failed, checking reason for:', productId.toString());
          
          // Find product to give specific error message
          const product = await this.productModel.findById(productId, null, options).lean();
          
          if (!product) {
            throw new NotFoundException('Sản phẩm không tồn tại');
          }

          const availableStock = product.stock ?? 0;
          console.error('[deductProductStock] Insufficient stock:', {
            productId: productId.toString(),
            name: product.name,
            available: availableStock,
            requested: item.quantity,
          });
          
          throw new BadRequestException(
            `Sản phẩm ${product.name} không đủ số lượng (Còn: ${availableStock}, Đặt: ${item.quantity})`
          );
        }
        
        updatedItems.push({ productId, quantity: item.quantity });
        console.log('[deductProductStock] Stock updated successfully for:', productId.toString());
      }
    } catch (error) {
      console.error('[deductProductStock] Error during stock deduction:', error?.message);
      // Manual rollback if needed (critical for non-transaction mode)
      if (updatedItems.length > 0) {
        console.log('[deductProductStock] Restoring stock for', updatedItems.length, 'items due to error');
        try {
           await this.restoreProductStock(updatedItems, true, session);
        } catch (restoreError) {
           console.error('[deductProductStock] Critical: Failed to restore stock', restoreError);
        }
      }
      throw error;
    }
  }

  private async restoreProductStock(items: any[], silent = false, session?: ClientSession) {
    if (!items || items.length === 0) {
      console.log('[restoreProductStock] No items to restore');
      return;
    }

    console.log('[restoreProductStock] Restoring stock for', items.length, 'items');
    for (const item of items) {
      if (!item.productId || !item.quantity) continue;
      
      try {
        const productId = item.productId instanceof Types.ObjectId 
          ? item.productId
          : new Types.ObjectId(item.productId);
        
        console.log('[restoreProductStock] Restoring:', { productId: productId.toString(), quantity: item.quantity });
        const restored = await this.productModel.findByIdAndUpdate(
          productId,
          { $inc: { stock: item.quantity, saleCount: -item.quantity } },
          { new: true, session }
        );
        console.log('[restoreProductStock] Restored successfully:', { productId: productId.toString(), newStock: restored?.stock });
      } catch (error) {
        console.error(`[restoreProductStock] Failed to restore stock for product ${item.productId}:`, error);
        // Nếu đang rollback sau khi trừ kho thất bại, tránh chặn lỗi gốc
        if (!silent) {
          throw error;
        }
      }
    }
  }

}
