import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { JwtPayload } from '../common/types/jwt-payload';
import { CartsService } from '../carts/carts.service';
import { OrdersService } from '../orders/orders.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { randomUUID } from 'crypto';
import { AiChatDto } from './dto/ai-chat.dto';
import { AiConfirmDto } from './dto/ai-confirm.dto';

type GeminiGenerateContentRequest = {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

type AiProductCard = {
  productId: string;
  name: string;
  price: number;
  stock: number;
  image?: string;
  category?: string;
  code?: string;
};

type AiAction =
  | {
      type: 'ADD_TO_CART';
      payload: { productId: string; quantity: number };
      requiresConfirmation: boolean;
      confirmationId?: string;
      note?: string;
    };

type PendingAction = {
  id: string;
  userId: string;
  action: AiAction;
  expiresAt: number;
};

@Injectable()
export class AiService {
  private readonly pendingActions = new Map<string, PendingAction>();

  constructor(
    private readonly config: ConfigService,
    private readonly ordersService: OrdersService,
    private readonly cartsService: CartsService,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async chat(dto: AiChatDto, user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException('Unauthorized');
    }

    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('AI chưa được cấu hình (thiếu GEMINI_API_KEY)');
    }

    const model = this.config.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';

    const { contextText, productCards } = await this.buildContext(dto.message, user);
    const systemInstruction = this.buildSystemInstruction(user, contextText);

    const contents = this.buildContents(dto);
    const requestBody: GeminiGenerateContentRequest = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
    };

    const reply = await this.callGemini(model, apiKey, requestBody);
    const actions = this.buildActions(dto.message, productCards, user.sub);

    return { reply, cards: productCards, actions };
  }

  async confirm(dto: AiConfirmDto, user: JwtPayload) {
    this.cleanupExpiredActions();

    const pending = this.pendingActions.get(dto.confirmationId);
    if (!pending) {
      throw new NotFoundException('Hành động đã hết hạn hoặc không tồn tại');
    }
    if (pending.userId !== user.sub) {
      throw new ForbiddenException('Hành động không thuộc về người dùng này');
    }
    if (pending.expiresAt < Date.now()) {
      this.pendingActions.delete(dto.confirmationId);
      throw new BadRequestException('Hành động đã hết hạn');
    }

    const action = pending.action;
    this.pendingActions.delete(dto.confirmationId);

    switch (action.type) {
      case 'ADD_TO_CART': {
        const quantity = dto.quantity ?? action.payload.quantity ?? 1;
        const productId = dto.productId ?? action.payload.productId;
        const cart = await this.cartsService.addItemForUser(user, productId, quantity);
        return {
          message: 'Đã thêm sản phẩm vào giỏ hàng',
          cart,
        };
      }
      default:
        throw new BadRequestException('Loại hành động không được hỗ trợ');
    }
  }

  private buildActions(message: string, productCards: AiProductCard[], userId: string): AiAction[] {
    const actions: AiAction[] = [];
    const wantsAddToCart = /(thêm|bỏ|cho)\s+(vào\s+)?(giỏ|gio\s*hang|cart)/i.test(message);
    const quantity = this.extractQuantity(message) || 1;

    if (wantsAddToCart && productCards.length) {
      const first = productCards[0];
      const action: AiAction = {
        type: 'ADD_TO_CART',
        payload: { productId: first.productId, quantity },
        requiresConfirmation: true,
        note: 'Thêm sản phẩm vào giỏ hàng của người dùng hiện tại',
      };
      actions.push(this.createPendingAction(userId, action));
    }

    return actions;
  }

  private buildSystemInstruction(user: JwtPayload, contextText: string) {
    return [
      'Bạn là trợ lý AI của ứng dụng bán linh kiện/điện tử.',
      'Luôn trả lời bằng tiếng Việt, rõ ràng, ngắn gọn theo dạng gợi ý hành động.',
      'Chỉ sử dụng dữ liệu được cung cấp trong phần CONTEXT. Không bịa thông tin.',
      'Không yêu cầu/không lưu mật khẩu, OTP, token. Không tiết lộ khóa API.',
      'Không thực hiện hành động thay người dùng (tạo/hủy đơn, thanh toán). Chỉ hướng dẫn thao tác trong app.',
      'ĐỊNH DẠNG BẮT BUỘC: viết thành các bullet ngắn gọn, không dùng ký tự * lặp nhiều lần; dùng dấu "-" đầu dòng. Nếu liệt kê sản phẩm, mỗi sản phẩm 1 dòng: "- Tên | Mã | Giá | Tồn kho". Nếu hướng dẫn, dùng 2-4 bullet ngắn. Không chèn dấu xuống dòng thừa.',
      'Nếu chỉ có 1 sản phẩm gợi ý, hãy mở đầu bằng tiêu đề ngắn (vd: "Gợi ý sản phẩm") rồi xuống dòng và bullet chi tiết.',
      user?.role === 'admin'
        ? 'Bạn đang hỗ trợ tài khoản admin (có thể xem dữ liệu tổng quan nếu được cung cấp trong CONTEXT).'
        : 'Bạn đang hỗ trợ người dùng thường: tuyệt đối không suy đoán hay truy cập dữ liệu của người khác.',
      '',
      'CONTEXT:',
      contextText || '(không có)',
    ].join('\n');
  }

  private buildContents(dto: AiChatDto): GeminiGenerateContentRequest['contents'] {
    const history = (dto.history || []).slice(-12);
    const contents: GeminiGenerateContentRequest['contents'] = history.map((h) => ({
      role: h.role === 'ai' ? 'model' : 'user',
      parts: [{ text: h.content }],
    }));

    const userParts = [{ text: dto.message }];
    if (dto.imageUrl) {
      userParts.push({ text: `Image URL (for reference): ${dto.imageUrl}` });
    }

    contents.push({ role: 'user', parts: userParts });
    return contents;
  }

  private async buildContext(
    message: string,
    user: JwtPayload,
  ): Promise<{ contextText: string; productCards: AiProductCard[] }> {
    const parts: string[] = [];
    const productCards: AiProductCard[] = [];

    const wantsOrders = /đơn\s*hàng|order|vận\s*chuyển|giao\s*hàng|tracking|mã\s*đơn|hủy|cancel/i.test(
      message,
    );
    if (wantsOrders) {
      const orders = await this.ordersService.findAll(user);
      const latest = [...orders]
        .sort((a: any, b: any) => {
          const atA = new Date(a?.createdAt || a?.status?.ordered || 0).getTime();
          const atB = new Date(b?.createdAt || b?.status?.ordered || 0).getTime();
          return atB - atA;
        })
        .slice(0, 5);

      parts.push(
        [
          'ĐƠN HÀNG GẦN ĐÂY (tối đa 5):',
          ...latest.map((o: any) => {
            const code = o?.code || o?._id;
            const cancelled = o?.isCancelled ? ' (ĐÃ HỦY)' : '';
            const total = typeof o?.totalPrice === 'number' ? `${o.totalPrice} VND` : 'N/A';
            const shipped = o?.status?.shipped ? 'đã shipped' : 'chưa shipped';
            const payment = o?.payment ? `payment=${o.payment}` : 'payment=N/A';
            const paymentStatus = o?.paymentStatus ? `paymentStatus=${o.paymentStatus}` : 'paymentStatus=N/A';
            return `- ${code}${cancelled} | ${shipped} | ${payment} | ${paymentStatus} | total=${total}`;
          }),
        ].join('\n'),
      );
    }

    const productHints = this.extractKeywords(message);
    if (productHints.length) {
      const orClauses = productHints.map((token) => {
        const rx = new RegExp(this.escapeRegExp(token), 'i');
        return [{ name: rx }, { code: rx }, { category: rx }];
      });
      const flatOr = orClauses.flat();
      const products = await this.productModel
        .find(flatOr.length ? { $or: flatOr } : {})
        .select({ name: 1, category: 1, code: 1, price: 1, stock: 1, images: 1 })
        .limit(5)
        .lean()
        .exec();

      if (products.length) {
        productCards.push(
          ...products.map((p) => ({
            productId: p._id.toString(),
            name: p.name,
            price: p.price?.salePrice ?? p.price?.originalPrice ?? 0,
            stock: typeof p.stock === 'number' ? p.stock : 0,
            category: p.category,
            code: p.code,
            image: Array.isArray(p.images) ? p.images[0] : undefined,
          })),
        );

        parts.push(
          [
            'SẢN PHẨM LIÊN QUAN (tối đa 5):',
            ...products.map((p: any) => {
              const code = p?.code ? `code=${p.code}` : 'code=N/A';
              const cat = p?.category ? `cat=${p.category}` : 'cat=N/A';
              const price = p?.price?.salePrice ?? p?.price?.originalPrice;
              const priceText = typeof price === 'number' ? `${price} VND` : 'N/A';
              const stockText = typeof p?.stock === 'number' ? `stock=${p.stock}` : 'stock=N/A';
              return `- ${p?.name || 'N/A'} | ${code} | ${cat} | price=${priceText} | ${stockText}`;
            }),
          ].join('\n'),
        );
      }
    }

    return { contextText: parts.join('\n\n'), productCards };
  }

  private extractKeywords(text: string) {
    const cleaned = (text || '')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .toLowerCase();
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const stop = new Set([
      'toi',
      'mình',
      'minh',
      'ban',
      'bạn',
      'cho',
      'xin',
      'hỏi',
      'gia',
      'giá',
      'mua',
      'tim',
      'tìm',
      'can',
      'cần',
      'voi',
      'với',
      'va',
      'và',
      'la',
      'là',
      'the',
      'a',
      'an',
      'of',
      'to',
      'in',
      'on',
      'i',
      'you',
      'me',
    ]);
    const keywords = tokens.filter((t) => t.length >= 3 && !stop.has(t)).slice(0, 4);
    return Array.from(new Set(keywords));
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private extractQuantity(message: string) {
    const match = message.match(/(\d+)\s*(cái|pcs|piece|sp|sản phẩm)?/i);
    if (!match) return null;
    const qty = Number(match[1]);
    return Number.isFinite(qty) ? qty : null;
  }

  private createPendingAction(userId: string, action: AiAction): AiAction {
    const id = randomUUID();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    const wrapped: PendingAction = { id, userId, action: { ...action, confirmationId: id }, expiresAt };
    this.pendingActions.set(id, wrapped);
    return { ...action, confirmationId: id };
  }

  private cleanupExpiredActions() {
    const now = Date.now();
    for (const [id, action] of this.pendingActions.entries()) {
      if (action.expiresAt < now) {
        this.pendingActions.delete(id);
      }
    }
  }

  private async callGemini(model: string, apiKey: string, body: GeminiGenerateContentRequest) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => ({}))) as GeminiGenerateContentResponse & {
      error?: { message?: string };
    };

    if (!response.ok) {
      const message = data?.error?.message || 'Không thể gọi Gemini. Vui lòng thử lại.';
      throw new ServiceUnavailableException(message);
    }

    return (
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ||
      'Mình chưa nhận được phản hồi hợp lệ từ AI. Bạn thử hỏi lại giúp mình nhé.'
    );
  }
}
