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
import { UsersService } from '../users/users.service';
import { randomUUID } from 'crypto';
import { AiChatDto } from './dto/ai-chat.dto';
import { AiConfirmDto } from './dto/ai-confirm.dto';
import { Buffer } from 'buffer';

type GeminiGenerateContentRequest = {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<
      | { text: string }
      | {
          inlineData: {
            mimeType: string;
            data: string;
          };
        }
    >;
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
    private readonly usersService: UsersService,
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

    // If image is provided, try vision flow first
    if (dto.imageUrl) {
      const parts = await this.extractPartsFromImage(dto.message, dto.imageUrl, apiKey, model);
      const productCards = await this.searchProductsByParts(parts);
      const reply = this.composeVisionReply(parts, productCards);
      const actions = this.buildActions(dto.message, productCards, user.sub);
      return { reply, cards: productCards, actions };
    }

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
    contents.push({ role: 'user', parts: userParts });
    return contents;
  }

  private async buildContext(
    message: string,
    user: JwtPayload,
  ): Promise<{ contextText: string; productCards: AiProductCard[] }> {
    const parts: string[] = [];
    const productCards: AiProductCard[] = [];
    const normalizedMessage = this.normalizeText(message);

    const wantsOrders =
      /don\s*hang|don\s*mua|lich\s*su\s*mua|order|van\s*chuyen|giao\s*hang|tracking|ma\s*don|huy\s*don|trang\s*thai\s*don|cancel/.test(
        normalizedMessage,
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
      const orderLines = latest.map((o: any) => {
        const code = o?.code || o?._id;
        const cancelled = o?.isCancelled ? ' (ĐÃ HỦY)' : '';
        const total = typeof o?.totalPrice === 'number' ? `${o.totalPrice} VND` : 'N/A';
        const shipped = o?.status?.shipped ? 'đã shipped' : 'chưa shipped';
        const payment = o?.payment ? `payment=${o.payment}` : 'payment=N/A';
        const paymentStatus = o?.paymentStatus ? `paymentStatus=${o.paymentStatus}` : 'paymentStatus=N/A';
        return `- ${code}${cancelled} | ${shipped} | ${payment} | ${paymentStatus} | total=${total}`;
      });

      parts.push(
        [
          'ĐƠN HÀNG GẦN ĐÂY (tối đa 5):',
          ...(orderLines.length ? orderLines : ['- Bạn chưa có đơn hàng nào.']),
        ].join('\n'),
      );
    }

    const wantsAddresses =
      /dia\s*chi|so\s*dia\s*chi|address|shipping\s*address|dia\s*chi\s*giao|dia\s*chi\s*nhan|dia\s*chi\s*mac\s*dinh/.test(
        normalizedMessage,
      );
    if (wantsAddresses) {
      const addresses = await this.usersService.getUserAddresses(user.sub);
      const sorted = [...addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
      parts.push(
        sorted.length
          ? [
              'ĐỊA CHỈ ĐÃ LƯU (ưu tiên địa chỉ mặc định):',
              ...sorted.map((addr: any) => {
                const receiver = addr?.name || 'Người nhận';
                const phone = addr?.phone || 'N/A';
                const line1 = [addr?.street, addr?.ward, addr?.district, addr?.city].filter(Boolean).join(', ');
                const type = addr?.type ? ` | ${addr.type}` : '';
                const isDefault = addr?.isDefault ? ' (mặc định)' : '';
                return `- ${receiver} | ${phone} | ${line1 || 'Địa chỉ trống'}${type}${isDefault}`;
              }),
            ].join('\n')
          : 'ĐỊA CHỈ ĐÃ LƯU: chưa có địa chỉ nào.',
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

  private async downloadImageAsBase64(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException('Không tải được ảnh để phân tích');
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return { base64: buffer.toString('base64'), mimeType: contentType.split(';')[0] || 'image/jpeg' };
  }

  private async extractPartsFromImage(message: string, imageUrl: string, apiKey: string, model: string) {
    const image = await this.downloadImageAsBase64(imageUrl);
    const prompt = [
      'Bạn là kỹ sư điện tử. Phân tích ảnh linh kiện/schematic.',
      'Hãy trích xuất danh sách linh kiện (reference, giá trị, part number) và mô tả ngắn.',
      `Ngữ cảnh người dùng: "${message || 'Không có'}"`,
      'Trả kết quả JSON thuần, KHÔNG thêm text, dạng: [{"name":"U1 hoặc D1...","value":"317T hoặc 1N4004...","package":"SOT-223...","notes":"..."}]',
      'Nếu không chắc, vẫn cố gắng trả JSON với các linh kiện có thể thấy; để trống field nếu không biết.',
    ].join('\n');

    const requestBody: GeminiGenerateContentRequest = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: image.mimeType,
                data: image.base64,
              },
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
    };

    const raw = await this.callGemini(model, apiKey, requestBody);
    return this.parsePartsFromResponse(raw);
  }

  private parsePartsFromResponse(raw: string) {
    const cleaned = raw.trim().replace(/```json/gi, '').replace(/```/g, '');
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed
          .map((p) => ({
            name: typeof p?.name === 'string' ? p.name : undefined,
            value: typeof p?.value === 'string' ? p.value : undefined,
            package: typeof p?.package === 'string' ? p.package : undefined,
            notes: typeof p?.notes === 'string' ? p.notes : undefined,
          }))
          .filter((p) => p.name || p.value);
      }
    } catch {
      // ignore parse error
    }
    return [];
  }

  private async searchProductsByParts(parts: Array<{ name?: string; value?: string }>) {
    const tokens = parts
      .flatMap((p) => [p.name, p.value])
      .filter(Boolean)
      .map((t) => (t || '').toString())
      .slice(0, 6);

    if (!tokens.length) return [];

    const ors = tokens.map((token) => {
      const rx = new RegExp(this.escapeRegExp(token), 'i');
      return [{ name: rx }, { code: rx }, { category: rx }];
    });
    const flatOr = ors.flat();
    const products = await this.productModel
      .find(flatOr.length ? { $or: flatOr } : {})
      .select({ name: 1, category: 1, code: 1, price: 1, stock: 1, images: 1 })
      .limit(5)
      .lean()
      .exec();

    return products.map((p) => ({
      productId: p._id.toString(),
      name: p.name,
      price: p.price?.salePrice ?? p.price?.originalPrice ?? 0,
      stock: typeof p.stock === 'number' ? p.stock : 0,
      category: p.category,
      code: p.code,
      image: Array.isArray(p.images) ? p.images[0] : undefined,
    }));
  }

  private composeVisionReply(
    parts: Array<{ name?: string; value?: string; package?: string; notes?: string }>,
    products: AiProductCard[],
  ) {
    const lines: string[] = [];
    if (parts.length) {
      lines.push('Các linh kiện phát hiện từ ảnh:');
      parts.slice(0, 6).forEach((p) => {
        const pieces = [p.name, p.value, p.package].filter(Boolean).join(' | ');
        lines.push(`- ${pieces || 'Linh kiện'}`);
      });
    } else {
      lines.push('- Không chắc linh kiện trong ảnh. Vui lòng chụp rõ hơn hoặc mô tả tên linh kiện.');
    }

    if (products.length) {
      lines.push('Gợi ý sản phẩm trong kho:');
      products.forEach((p) => {
        lines.push(`- ${p.name} | ${p.code || 'N/A'} | ${p.price} VND | Tồn ${p.stock}`);
      });
    } else {
      lines.push('- Chưa tìm thấy sản phẩm trùng khớp, bạn thử mô tả tên/mã linh kiện.');
    }
    return lines.join('\n');
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

  private normalizeText(value: string) {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase();
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
