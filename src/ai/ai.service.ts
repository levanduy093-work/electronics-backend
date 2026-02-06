import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { OrderDocument } from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { UsersService } from '../users/users.service';
import { createHash, randomUUID } from 'crypto';
import { AiChatDto } from './dto/ai-chat.dto';
import { AiConfirmDto } from './dto/ai-confirm.dto';
import { Buffer } from 'buffer';

// Types for order context (lean query result)
interface OrderContext {
  _id?: unknown;
  code?: string;
  createdAt?: Date | string;
  status?: {
    ordered?: Date | string;
    shipped?: Date | string;
  };
  isCancelled?: boolean;
  totalPrice?: number;
  payment?: string;
  paymentStatus?: string;
}

// Types for address context
interface AddressContext {
  name?: string;
  phone?: string;
  street?: string;
  ward?: string;
  district?: string;
  city?: string;
  type?: string;
  isDefault?: boolean;
}

// Types for product context (lean query result)
interface ProductContext {
  _id: unknown;
  name?: string;
  code?: string;
  category?: string;
  price?: {
    originalPrice?: number;
    salePrice?: number;
  };
  stock?: number;
  images?: string[];
}

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
    responseMimeType?: string;
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

type AiAction = {
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

type ProductIndexItem = {
  productId: string;
  name: string;
  code?: string;
  category?: string;
  description?: string;
  price: number;
  stock: number;
  image?: string;
  codeNormalized?: string;
  tokens: {
    name: Set<string>;
    category: Set<string>;
    description: Set<string>;
    all: Set<string>;
    value: Set<string>;
  };
};

type ProductScore = {
  product: ProductIndexItem;
  score: number;
  matchedTokens: number;
  codeExact: boolean;
};

type ProductSearchMeta = {
  tokens: string[];
  valueTokens: string[];
  totalCandidates: number;
  confident: boolean;
  topScore: number;
};

type ProductSearchResult = {
  cards: AiProductCard[];
  contextLines: string[];
  meta: ProductSearchMeta;
};

type IntentFlags = {
  normalizedMessage: string;
  wantsOrders: boolean;
  wantsAddresses: boolean;
  wantsProducts: boolean;
  needsFreeform: boolean;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly pendingActions = new Map<string, PendingAction>();
  private readonly productIndexTtlMs = 2 * 60 * 1000; // 2 minutes
  private readonly imagePartsTtlMs = 10 * 60 * 1000; // 10 minutes
  private readonly chatCacheTtlMs = 3 * 60 * 1000; // 3 minutes
  private productIndexCache?: { items: ProductIndexItem[]; expiresAt: number };
  private readonly imagePartsCache = new Map<
    string,
    { parts: Array<any>; raw?: string; expiresAt: number }
  >();
  private readonly chatCache = new Map<
    string,
    { value: { reply: string; cards?: AiProductCard[]; actions?: AiAction[] }; expiresAt: number }
  >();

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
      throw new ServiceUnavailableException(
        'AI chưa được cấu hình (thiếu GEMINI_API_KEY)',
      );
    }

    const model = this.config.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
    const intent = this.detectIntentFlags(dto.message);
    const canCacheChat = !intent.wantsOrders && !intent.wantsAddresses;

    if (canCacheChat) {
      const cacheKey = this.buildChatCacheKey(dto, user.sub, model);
      const cached = this.getChatCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // If image is provided, try vision flow first
    if (dto.imageUrl) {
      const cacheKey = this.buildImageCacheKey(dto.imageUrl, dto.message);
      const cached = this.getCachedImageParts(cacheKey);
      let parts: Array<any> = [];
      let raw: string | undefined;
      if (cached) {
        parts = cached.parts;
        raw = cached.raw;
      } else {
        const extracted = await this.extractPartsFromImage(
          dto.message,
          dto.imageUrl,
          apiKey,
          model,
        );
        parts = extracted.parts;
        raw = extracted.raw;
        this.setCachedImageParts(cacheKey, parts, raw);
      }
      // Pass apiKey and model to AI-filter products
      const allCards = await this.searchProductsByParts(parts, apiKey, model);
      const productCards = allCards.filter(
        (card) => card !== null,
      ) as AiProductCard[];
      const reply = this.sanitizeAiReply(
        this.composeVisionReply(parts, productCards, raw),
      );
      const actions = this.buildActions(dto.message, productCards, user.sub);
      const result = { reply, cards: productCards, actions };
      if (canCacheChat) {
        const cacheKey = this.buildChatCacheKey(dto, user.sub, model);
        this.setChatCache(cacheKey, result);
      }
      return result;
    }

    const {
      contextText,
      productCards,
      productSearchMeta,
      orderLines,
      addressLines,
    } = await this.buildContext(dto.message, user, intent);

    const deterministicReply = this.buildDeterministicReply({
      message: dto.message,
      intent,
      productCards,
      productSearchMeta,
      orderLines,
      addressLines,
    });

    if (deterministicReply && !intent.needsFreeform) {
      const actions = this.buildActions(dto.message, productCards, user.sub);
      const result = {
        reply: this.sanitizeAiReply(deterministicReply),
        cards: productCards,
        actions,
      };
      if (canCacheChat) {
        const cacheKey = this.buildChatCacheKey(dto, user.sub, model);
        this.setChatCache(cacheKey, result);
      }
      return result;
    }

    let finalCards = productCards;
    const shouldRerank = this.shouldRerankProducts(
      intent,
      productSearchMeta,
      productCards,
    );
    if (shouldRerank) {
      finalCards = await this.rerankProducts(
        dto.message,
        productCards,
        model,
        apiKey,
      );
    }

    const systemInstruction = this.buildSystemInstruction(user, contextText);
    const contents = this.buildContents(dto);
    const requestBody: GeminiGenerateContentRequest = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    };

    const rawReply = await this.callGemini(model, apiKey, requestBody);

    // Parse relevant codes from LLM response to filter irrelevant products from UI
    let reply = rawReply;
    const codeMatch = rawReply.match(/RELEVANT_CODES:\s*\[(.*?)\]/);
    if (codeMatch) {
      try {
        const codesStr = codeMatch[1];
        const codes = codesStr
          .split(',')
          .map((c) => c.trim().replace(/['"]/g, ''))
          .filter(Boolean);

        if (codes.length > 0) {
          // If the AI explicitly identified relevant codes, filter the cards
          finalCards = productCards.filter(
            (p) => p.code && codes.includes(p.code),
          );
        } else {
          // AI returned empty list [] -> user likely asked something else or no product matched
          // Instruction says: "Nếu không có sản phẩm phù hợp, trả về []".
          finalCards = [];
        }
      } catch {
        // ignore parse error context
      }
      // Remove the control line from the message presented to user
      reply = rawReply.replace(/RELEVANT_CODES:.*(\n|$)/, '').trim();
    }

    reply = this.sanitizeAiReply(reply);
    const actions = this.buildActions(dto.message, finalCards, user.sub);

    const result = { reply, cards: finalCards, actions };
    if (canCacheChat) {
      const cacheKey = this.buildChatCacheKey(dto, user.sub, model);
      this.setChatCache(cacheKey, result);
    }
    return result;
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
        const cart = await this.cartsService.addItemForUser(
          user,
          productId,
          quantity,
        );
        return {
          message: 'Đã thêm sản phẩm vào giỏ hàng',
          cart,
        };
      }
      default:
        throw new BadRequestException('Loại hành động không được hỗ trợ');
    }
  }

  private buildActions(
    message: string,
    productCards: AiProductCard[],
    userId: string,
  ): AiAction[] {
    const actions: AiAction[] = [];
    const wantsAddToCart =
      /(thêm|bỏ|cho)\s+(vào\s+)?(giỏ|gio\s*hang|cart)/i.test(message);
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
      'Ưu tiên dùng dữ liệu trong phần CONTEXT. Nếu CONTEXT không có thông tin liên quan, hãy trả lời bằng kiến thức phổ thông về điện tử một cách ngắn gọn, rõ ràng.',
      'Không yêu cầu/không lưu mật khẩu, OTP, token. Không tiết lộ khóa API.',
      'Không thực hiện hành động thay người dùng (tạo/hủy đơn, thanh toán). Chỉ hướng dẫn thao tác trong app.',
      'ĐỊNH DẠNG BẮT BUỘC: viết thành các bullet ngắn gọn, không dùng Markdown/bôi đậm (tránh ký tự * hoặc **); dùng dấu "-" đầu dòng. Nếu liệt kê sản phẩm, mỗi sản phẩm 1 dòng: "- Tên | Mã | Giá | Tồn kho". Nếu hướng dẫn, dùng 2-4 bullet ngắn. Không chèn dấu xuống dòng thừa.',
      'Nếu chỉ có 1 sản phẩm gợi ý, hãy mở đầu bằng tiêu đề ngắn (vd: "Gợi ý sản phẩm") rồi xuống dòng và bullet chi tiết.',
      'CHỌN LỌC SẢN PHẨM: Nếu context có nhiều sản phẩm nhưng chỉ một số phù hợp với câu hỏi, chỉ trả lời về sản phẩm phù hợp. Cuối câu trả lời, hãy liệt kê mã sản phẩm (code) của những sản phẩm phù hợp nhất trong một dòng ẩn theo format: "RELEVANT_CODES: [CODE1, CODE2]". Nếu không có sản phẩm phù hợp, trả về "RELEVANT_CODES: []".',
      user?.role === 'admin'
        ? 'Bạn đang hỗ trợ tài khoản admin (có thể xem dữ liệu tổng quan nếu được cung cấp trong CONTEXT).'
        : 'Bạn đang hỗ trợ người dùng thường: tuyệt đối không suy đoán hay truy cập dữ liệu của người khác.',
      '',
      'CONTEXT:',
      contextText || '(không có)',
    ].join('\n');
  }

  private buildContents(
    dto: AiChatDto,
  ): GeminiGenerateContentRequest['contents'] {
    const history = (dto.history || []).slice(-20);
    const contents: GeminiGenerateContentRequest['contents'] = history.map(
      (h) => ({
        role: h.role === 'ai' ? 'model' : 'user',
        parts: [{ text: h.content }],
      }),
    );

    const userParts = [{ text: dto.message }];
    contents.push({ role: 'user', parts: userParts });
    return contents;
  }

  private sanitizeAiReply(text: string) {
    if (!text) return text;
    return text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`{1,3}/g, '')
      .trim();
  }

  private detectIntentFlags(message: string): IntentFlags {
    const normalizedMessage = this.normalizeText(message);
    const wantsOrders =
      /don\s*hang|don\s*mua|lich\s*su\s*mua|order|van\s*chuyen|giao\s*hang|tracking|ma\s*don|huy\s*don|trang\s*thai\s*don|cancel/.test(
        normalizedMessage,
      );
    const wantsAddresses =
      /dia\s*chi|so\s*dia\s*chi|address|shipping\s*address|dia\s*chi\s*giao|dia\s*chi\s*nhan|dia\s*chi\s*mac\s*dinh/.test(
        normalizedMessage,
      );
    const wantsProducts =
      this.extractQueryTokens(message, normalizedMessage).length > 0;
    const needsFreeform =
      /tai\s*sao|vi\s*sao|so\s*sanh|khac\s*nhau|nen\s*chon|tu\s*van|huong\s*dan|cach\s*lam|la\s*gi|dung\s*de|nguyen\s*ly|co\s*phai|thong\s*so|how\s*to|why|compare|recommend|advisor|guide/.test(
        normalizedMessage,
      ) || (message || '').length > 350;

    return {
      normalizedMessage,
      wantsOrders,
      wantsAddresses,
      wantsProducts,
      needsFreeform,
    };
  }

  private shouldRerankProducts(
    intent: IntentFlags,
    meta: ProductSearchMeta | null,
    products: AiProductCard[],
  ) {
    if (!meta || !products?.length) return false;
    if (intent.needsFreeform) return false; // already using LLM for reply; avoid extra cost
    if (meta.confident) return false;
    if (products.length < 6) return false;
    if (products.length > 40) return false;
    return true;
  }

  private formatProductBullet(card: AiProductCard) {
    const code = card.code || 'N/A';
    const price = Number.isFinite(card.price) ? `${card.price} VND` : 'N/A';
    const stock = Number.isFinite(card.stock)
      ? `Tồn kho ${card.stock}`
      : 'N/A';
    return `- ${card.name || 'N/A'} | ${code} | ${price} | ${stock}`;
  }

  private buildDeterministicReply(input: {
    message: string;
    intent: IntentFlags;
    productCards: AiProductCard[];
    productSearchMeta: ProductSearchMeta | null;
    orderLines: string[];
    addressLines: string[];
  }) {
    const lines: string[] = [];

    if (input.intent.wantsOrders) {
      lines.push('Đơn hàng gần đây:');
      lines.push(...(input.orderLines.length ? input.orderLines : ['- Không có đơn hàng nào.']));
    }

    if (input.intent.wantsAddresses) {
      lines.push('Địa chỉ đã lưu:');
      lines.push(
        ...(input.addressLines.length
          ? input.addressLines
          : ['- Chưa có địa chỉ nào.']),
      );
    }

    if (input.intent.wantsProducts) {
      if (input.productCards.length) {
        if (input.productCards.length === 1) {
          lines.push('Gợi ý sản phẩm');
        } else {
          lines.push('Danh sách sản phẩm phù hợp:');
        }
        lines.push(...input.productCards.map((c) => this.formatProductBullet(c)));

        if (input.productSearchMeta && !input.productSearchMeta.confident) {
          lines.push(
            'Bạn cho mình thêm mã hoặc thông số (giá trị, loại linh kiện) để lọc chính xác hơn nhé.',
          );
        }
      } else {
        lines.push('Chưa tìm thấy sản phẩm phù hợp.');
        lines.push(
          'Bạn cho mình thêm mã sản phẩm, giá trị linh kiện hoặc loại linh kiện nhé.',
        );
      }
    }

    if (!lines.length) return null;
    return lines.join('\n');
  }

  private async buildContext(
    message: string,
    user: JwtPayload,
    intent: IntentFlags,
  ): Promise<{
    contextText: string;
    productCards: AiProductCard[];
    productSearchMeta: ProductSearchMeta | null;
    orderLines: string[];
    addressLines: string[];
  }> {
    const parts: string[] = [];
    const productCards: AiProductCard[] = [];
    const orderLines: string[] = [];
    const addressLines: string[] = [];
    let productSearchMeta: ProductSearchMeta | null = null;

    if (intent.wantsOrders) {
      const orders = await this.ordersService.findAll(user);
      const latest = [...(orders as OrderContext[])]
        .sort((a, b) => {
          const atA = new Date(
            a?.createdAt || a?.status?.ordered || 0,
          ).getTime();
          const atB = new Date(
            b?.createdAt || b?.status?.ordered || 0,
          ).getTime();
          return atB - atA;
        })
        .slice(0, 5);
      const orderLineItems = latest.map((o) => {
        const code = o?.code || (o?._id ? String(o._id as any) : '');
        const cancelled = o?.isCancelled ? ' (ĐÃ HỦY)' : '';
        const total =
          typeof o?.totalPrice === 'number' ? `${o.totalPrice} VND` : 'N/A';
        const shipped = o?.status?.shipped ? 'đã shipped' : 'chưa shipped';
        const payment = o?.payment ? `payment=${o.payment}` : 'payment=N/A';
        const paymentStatus = o?.paymentStatus
          ? `paymentStatus=${o.paymentStatus}`
          : 'paymentStatus=N/A';
        return `- ${code}${cancelled} | ${shipped} | ${payment} | ${paymentStatus} | total=${total}`;
      });
      orderLines.push(...orderLineItems);

      parts.push(
        [
          'ĐƠN HÀNG GẦN ĐÂY (tối đa 5):',
          ...(orderLines.length ? orderLines : ['- Bạn chưa có đơn hàng nào.']),
        ].join('\n'),
      );
    }

    if (intent.wantsAddresses) {
      const addresses = await this.usersService.getUserAddresses(user.sub);
      const sorted = [...(addresses as AddressContext[])].sort(
        (a, b) => Number(b.isDefault) - Number(a.isDefault),
      );
      if (sorted.length) {
        addressLines.push(
          ...sorted.map((addr) => {
            const receiver = addr?.name || 'Người nhận';
            const phone = addr?.phone || 'N/A';
            const line1 = [
              addr?.street,
              addr?.ward,
              addr?.district,
              addr?.city,
            ]
              .filter(Boolean)
              .join(', ');
            const type = addr?.type ? ` | ${addr.type}` : '';
            const isDefault = addr?.isDefault ? ' (mặc định)' : '';
            return `- ${receiver} | ${phone} | ${line1 || 'Địa chỉ trống'}${type}${isDefault}`;
          }),
        );
      }

      parts.push(
        addressLines.length
          ? [
              'ĐỊA CHỈ ĐÃ LƯU (ưu tiên địa chỉ mặc định):',
              ...addressLines,
            ].join('\n')
          : 'ĐỊA CHỈ ĐÃ LƯU: chưa có địa chỉ nào.',
      );
    }

    if (intent.wantsProducts) {
      const search = await this.searchProductsDeterministic(message);
      productCards.push(...search.cards);
      productSearchMeta = search.meta;

      if (search.contextLines.length) {
        parts.push(
          [
            'SẢN PHẨM LIÊN QUAN (tối đa 30):',
            ...search.contextLines,
          ].join('\n'),
        );
      }
    }

    return {
      contextText: parts.join('\n\n'),
      productCards,
      productSearchMeta,
      orderLines,
      addressLines,
    };
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
      'con',
      'còn',
      'hàng',
      'hang',
      'không',
      'khong',
      'co',
      'có',
      'nhieu',
      'nhiêu',
      'bao',
      'bn',
      'shop',
      'cai',
      'cái',
      'don',
      'đơn',
      'dia',
      'địa',
      'chi',
      'chỉ',
      'order',
      'tracking',
      'address',
      'shipping',
      'dang',
      'đang',
      'het',
    ]);
    const keywords = tokens
      .filter((t) => t.length >= 2 && !stop.has(t))
      .slice(0, 8);
    return Array.from(new Set(keywords));
  }

  private normalizeForSearch(value: string) {
    return (value || '')
      .replace(/µ/gi, 'u')
      .replace(/Ω/gi, 'ohm')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase();
  }

  private tokenize(value: string) {
    const cleaned = this.normalizeForSearch(value).replace(/[^a-z0-9]+/g, ' ');
    return cleaned.split(/\s+/).filter(Boolean);
  }

  private deriveSynonymTokens(normalizedMessage: string) {
    const tokens = new Set<string>();
    if (/\bdien\s*tro\b/.test(normalizedMessage) || /\bresistor\b/.test(normalizedMessage)) {
      tokens.add('resistor');
    }
    if (/\btu\s*(dien)?\b/.test(normalizedMessage) || /\bcapacitor\b/.test(normalizedMessage)) {
      tokens.add('capacitor');
    }
    if (/\bdiode\b/.test(normalizedMessage)) {
      tokens.add('diode');
    }
    if (/\bled\b/.test(normalizedMessage)) {
      tokens.add('led');
    }
    if (/\btransistor\b/.test(normalizedMessage)) {
      tokens.add('transistor');
    }
    if (/\bmosfet\b/.test(normalizedMessage)) {
      tokens.add('mosfet');
    }
    if (/\bvi\s*mach\b/.test(normalizedMessage) || /\bchip\b/.test(normalizedMessage) || /\bic\b/.test(normalizedMessage)) {
      tokens.add('ic');
    }
    if (/\brelay\b/.test(normalizedMessage)) {
      tokens.add('relay');
    }
    if (/\bcong\s*ket|connector|jack\b/.test(normalizedMessage)) {
      tokens.add('connector');
    }
    return Array.from(tokens);
  }

  private extractQueryTokens(message: string, normalizedMessage?: string) {
    const base = this.extractKeywords(message);
    const tokens = base.flatMap((t) => this.tokenize(t));
    const extra = this.deriveSynonymTokens(
      normalizedMessage ?? this.normalizeText(message),
    );
    const combined = new Set<string>();
    tokens.forEach((t) => combined.add(t));
    extra.forEach((t) => combined.add(t));
    return Array.from(combined).slice(0, 12);
  }

  private extractValueTokens(text: string) {
    const normalized = this.normalizeForSearch(text);
    const matches =
      normalized.match(
        /\b\d+(?:\.\d+)?\s*(?:k|m|g|u|n|p)?\s*(?:ohm|hz|v|a|w|f|h)?\b/g,
      ) || [];
    const tokens = matches
      .map((m) => m.replace(/\s+/g, ''))
      .filter((m) => m.length >= 2);
    const expanded = new Set<string>();
    for (const token of tokens) {
      expanded.add(token);
      const stripped = token.replace(/(ohm|hz|v|a|w|f|h)$/i, '');
      if (stripped.length >= 2) expanded.add(stripped);
    }
    return Array.from(expanded).slice(0, 12);
  }

  private buildProductIndexItem(p: ProductContext & { description?: string }) {
    const name = p.name || '';
    const category = p.category || '';
    const description = p.description || '';
    const code = p.code || '';
    const nameTokens = new Set(this.tokenize(name));
    const categoryTokens = new Set(this.tokenize(category));
    const descriptionTokens = new Set(this.tokenize(description));
    const valueTokens = new Set([
      ...this.extractValueTokens(name),
      ...this.extractValueTokens(description),
      ...this.extractValueTokens(code),
    ]);
    const allTokens = new Set<string>();
    nameTokens.forEach((t) => allTokens.add(t));
    categoryTokens.forEach((t) => allTokens.add(t));
    descriptionTokens.forEach((t) => allTokens.add(t));
    if (code) allTokens.add(this.normalizeForSearch(code));

    return {
      productId: String(p._id),
      name,
      code: p.code,
      category: p.category,
      description,
      price: p.price?.salePrice ?? p.price?.originalPrice ?? 0,
      stock: typeof p.stock === 'number' ? p.stock : 0,
      image: Array.isArray(p.images) ? p.images[0] : undefined,
      codeNormalized: code ? this.normalizeForSearch(code) : undefined,
      tokens: {
        name: nameTokens,
        category: categoryTokens,
        description: descriptionTokens,
        all: allTokens,
        value: valueTokens,
      },
    } satisfies ProductIndexItem;
  }

  private async getProductIndex() {
    const now = Date.now();
    if (this.productIndexCache && this.productIndexCache.expiresAt > now) {
      return this.productIndexCache.items;
    }

    const products = (await this.productModel
      .find({})
      .select({
        name: 1,
        category: 1,
        code: 1,
        price: 1,
        stock: 1,
        images: 1,
        description: 1,
      })
      .lean()
      .exec()) as Array<ProductContext & { description?: string }>;

    const items = products.map((p) => this.buildProductIndexItem(p));
    this.productIndexCache = {
      items,
      expiresAt: now + this.productIndexTtlMs,
    };
    return items;
  }

  private scoreProducts(
    products: ProductIndexItem[],
    queryTokens: string[],
    valueTokens: string[],
  ): ProductScore[] {
    const scores: ProductScore[] = [];
    for (const product of products) {
      let score = 0;
      let matchedTokens = 0;
      let codeExact = false;

      for (const token of queryTokens) {
        if (!token) continue;
        if (product.codeNormalized && token === product.codeNormalized) {
          score += 200;
          matchedTokens += 2;
          codeExact = true;
          continue;
        }
        if (product.tokens.name.has(token)) {
          score += 30;
          matchedTokens += 1;
          continue;
        }
        if (product.tokens.category.has(token)) {
          score += 20;
          matchedTokens += 1;
          continue;
        }
        if (product.tokens.description.has(token)) {
          score += 10;
          matchedTokens += 1;
        }
      }

      for (const token of valueTokens) {
        if (product.tokens.value.has(token)) {
          score += 80;
          matchedTokens += 1;
        }
      }

      if (matchedTokens >= 3) score += 10;
      if (score > 0) {
        scores.push({ product, score, matchedTokens, codeExact });
      }
    }

    return scores;
  }

  private assessConfidence(
    scores: ProductScore[],
    queryTokens: string[],
    valueTokens: string[],
  ) {
    if (!scores.length) return false;
    const top = scores[0];
    if (top.codeExact) return true;
    const totalTokens = Math.max(1, queryTokens.length + valueTokens.length);
    const matchRatio = top.matchedTokens / totalTokens;
    const gap = scores.length > 1 ? top.score - scores[1].score : top.score;
    return top.score >= 90 && (matchRatio >= 0.6 || gap >= 30);
  }

  private async searchProductsDeterministic(
    message: string,
  ): Promise<ProductSearchResult> {
    const index = await this.getProductIndex();
    const normalizedMessage = this.normalizeText(message);
    const queryTokens = this.extractQueryTokens(message, normalizedMessage);
    const valueTokens = this.extractValueTokens(message);

    if (!queryTokens.length && !valueTokens.length) {
      return {
        cards: [],
        contextLines: [],
        meta: {
          tokens: [],
          valueTokens: [],
          totalCandidates: 0,
          confident: false,
          topScore: 0,
        },
      };
    }

    const scores = this.scoreProducts(index, queryTokens, valueTokens)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);

    const confident = this.assessConfidence(scores, queryTokens, valueTokens);
    const topScores = scores.slice(0, 15);
    const contextScores = scores.slice(0, 30);

    const cards = topScores.map((s) => ({
      productId: s.product.productId,
      name: s.product.name,
      price: s.product.price,
      stock: s.product.stock,
      category: s.product.category,
      code: s.product.code,
      image: s.product.image,
    }));

    const contextLines = contextScores.map((s) => {
      const code = s.product.code ? `code=${s.product.code}` : 'code=N/A';
      const cat = s.product.category ? `cat=${s.product.category}` : 'cat=N/A';
      const priceText = Number.isFinite(s.product.price)
        ? `${s.product.price} VND`
        : 'N/A';
      const stockText = Number.isFinite(s.product.stock)
        ? `stock=${s.product.stock}`
        : 'stock=N/A';
      return `- ${s.product.name || 'N/A'} | ${code} | ${cat} | price=${priceText} | ${stockText}`;
    });

    return {
      cards,
      contextLines,
      meta: {
        tokens: queryTokens,
        valueTokens,
        totalCandidates: scores.length,
        confident,
        topScore: scores[0]?.score ?? 0,
      },
    };
  }

  private async rerankProducts(
    message: string,
    products: AiProductCard[],
    model: string,
    apiKey: string,
  ) {
    if (!products?.length) return products;

    const rows = products.map((p) => {
      const code = p.code || p.productId;
      const price = Number.isFinite(p.price) ? `${p.price} VND` : 'N/A';
      const stock = Number.isFinite(p.stock) ? p.stock : 'N/A';
      return `${code} | ${p.name} | ${p.category || 'N/A'} | price=${price} | stock=${stock}`;
    });

    const prompt = [
      'Bạn là bộ lọc/rerank sản phẩm. Nhiệm vụ: nhận câu hỏi người dùng và danh sách sản phẩm (code | name | category | price | stock).',
      'Hãy trả về một mảng JSON các code sản phẩm liên quan nhất, sắp xếp giảm dần độ phù hợp. Không giải thích.',
      'Nếu không có sản phẩm phù hợp, trả về [].',
      `User query: "${message}"`,
      'Products:',
      rows.join('\n'),
      'Trả về JSON array, ví dụ: ["CODE1", "CODE2"]. Chỉ dùng code xuất hiện trong danh sách trên. Giới hạn tối đa 15 code.',
    ].join('\n');

    const requestBody: GeminiGenerateContentRequest = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
    };

    let codes: string[] = [];
    try {
      const raw = await this.callGemini(model, apiKey, requestBody);
      codes = this.parseCodesFromRerank(raw);
    } catch (e) {
      return products;
    }

    if (!codes.length) return products;

    const orderMap = new Map<string, number>();
    codes.forEach((c, idx) => orderMap.set(c.toLowerCase(), idx));

    const byCode = products.filter((p) => {
      const code = (p.code || p.productId || '').toLowerCase();
      return code && orderMap.has(code);
    });

    byCode.sort((a, b) => {
      const ca = (a.code || a.productId || '').toLowerCase();
      const cb = (b.code || b.productId || '').toLowerCase();
      return (
        (orderMap.get(ca) ?? Number.MAX_SAFE_INTEGER) -
        (orderMap.get(cb) ?? Number.MAX_SAFE_INTEGER)
      );
    });

    // Only show the reranked items. If rerank returns empty, fallback was handled above.
    return byCode.slice(0, 15);
  }

  private parseCodesFromRerank(raw: string): string[] {
    if (!raw) return [];
    let cleaned = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.substring(start, end + 1);
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed
          .map((c) => (typeof c === 'string' ? c.trim() : ''))
          .filter(Boolean)
          .slice(0, 15);
      }
    } catch (e) {
      return [];
    }

    return [];
  }

  private buildImageCacheKey(imageUrl: string, message?: string) {
    const normalizedMsg = this.normalizeForSearch(message || '').slice(0, 80);
    return `${imageUrl}::${normalizedMsg}`;
  }

  private pruneImageCache() {
    const now = Date.now();
    for (const [key, value] of this.imagePartsCache.entries()) {
      if (value.expiresAt < now) {
        this.imagePartsCache.delete(key);
      }
    }
    if (this.imagePartsCache.size > 200) {
      let removed = 0;
      for (const key of this.imagePartsCache.keys()) {
        this.imagePartsCache.delete(key);
        removed += 1;
        if (removed >= 50) break;
      }
    }
  }

  private getCachedImageParts(key: string) {
    this.pruneImageCache();
    const cached = this.imagePartsCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt < Date.now()) {
      this.imagePartsCache.delete(key);
      return null;
    }
    return cached;
  }

  private setCachedImageParts(
    key: string,
    parts: Array<any>,
    raw?: string,
  ) {
    this.pruneImageCache();
    this.imagePartsCache.set(key, {
      parts,
      raw,
      expiresAt: Date.now() + this.imagePartsTtlMs,
    });
  }

  private buildChatCacheKey(dto: AiChatDto, userId: string, model: string) {
    const history = Array.isArray(dto.history) ? dto.history : [];
    const payload = {
      userId,
      model,
      message: dto.message || '',
      imageUrl: dto.imageUrl || '',
      history: history.map((h) => ({
        role: h.role,
        content: h.content,
      })),
    };
    const raw = JSON.stringify(payload);
    return createHash('sha256').update(raw).digest('hex');
  }

  private pruneChatCache() {
    const now = Date.now();
    for (const [key, value] of this.chatCache.entries()) {
      if (value.expiresAt < now) {
        this.chatCache.delete(key);
      }
    }
    if (this.chatCache.size > 200) {
      let removed = 0;
      for (const key of this.chatCache.keys()) {
        this.chatCache.delete(key);
        removed += 1;
        if (removed >= 50) break;
      }
    }
  }

  private getChatCache(key: string) {
    this.pruneChatCache();
    const cached = this.chatCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt < Date.now()) {
      this.chatCache.delete(key);
      return null;
    }
    return cached.value;
  }

  private setChatCache(
    key: string,
    value: { reply: string; cards?: AiProductCard[]; actions?: AiAction[] },
  ) {
    this.pruneChatCache();
    this.chatCache.set(key, {
      value,
      expiresAt: Date.now() + this.chatCacheTtlMs,
    });
  }

  private async downloadImageAsBase64(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException('Không tải được ảnh để phân tích');
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      base64: buffer.toString('base64'),
      mimeType: contentType.split(';')[0] || 'image/jpeg',
    };
  }

  private async extractPartsFromImage(
    message: string,
    imageUrl: string,
    apiKey: string,
    model: string,
  ) {
    const image = await this.downloadImageAsBase64(imageUrl);
    const prompt = [
      'Bạn là chuyên gia về mạch điện tử. Hãy phân tích ảnh (schematic hoặc linh kiện thực tế) và trích xuất danh sách linh kiện.',
      'Yêu cầu: Trả về 1 mảng JSON thuần gồm các object có cấu trúc:',
      '{ "name": "Mã linh kiện (VD: LM555, LM7805) hoặc Tên tiếng Anh (VD: Resistor)", "vietnameseName": "Tên tiếng Việt (VD: Điện trở, Tụ điện, IC)", "value": "Giá trị (VD: 10k, 100uF)", "designator": "Ký hiệu (VD: R1, U1)" }',
      'Quy tắc:',
      '1. Nếu là schematic, ưu tiên đọc mã IC (như LM555, NE555) và đưa vào "name".',
      '2. Đọc kỹ các ký hiệu linh kiện (designator) và giá trị (value) đi kèm.',
      '3. Suy luận "vietnameseName" từ ký hiệu: R->Điện trở, C->Tụ điện, D/LED->Diode/Led, U/IC->IC.',
      '4. CHỈ TRẢ VỀ JSON ARRAY. Không giải thích.',
      `Context thêm từ user: "${message || ''}"`,
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
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2000,
      },
    };

    const raw = await this.callGemini(model, apiKey, requestBody);
    return { parts: this.parsePartsFromResponse(raw), raw };
  }

  private parsePartsFromResponse(raw: string) {
    // Remove markdown code blocks and whitespace
    let cleaned = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');

    if (firstBracket !== -1) {
      if (lastBracket !== -1 && lastBracket > firstBracket) {
        // Complete array found
        cleaned = cleaned.substring(firstBracket, lastBracket + 1);
      } else {
        // Likely truncated: try to salvage valid objects up to the last closing brace
        const lastCurly = cleaned.lastIndexOf('}');
        if (lastCurly > firstBracket) {
          cleaned = cleaned.substring(firstBracket, lastCurly + 1) + ']';
        } else {
          // Cannot salvage
          return [];
        }
      }
    } else {
      return [];
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed
          .map((p) => ({
            name: typeof p?.name === 'string' ? p.name : null,
            vietnameseName:
              typeof p?.vietnameseName === 'string' ? p.vietnameseName : null,
            value: typeof p?.value === 'string' ? p.value : null,
            package: typeof p?.package === 'string' ? p.package : null,
            notes:
              typeof p?.designator === 'string'
                ? p.designator
                : typeof p?.notes === 'string'
                  ? p.notes
                  : null,
          }))
          .filter((p) => p.name || p.value || p.vietnameseName);
      }
    } catch (e) {
      // JSON parse failed even after repair attempt
    }
    return [];
  }

  private async searchProductsByParts(
    parts: Array<{ name?: string; value?: string; vietnameseName?: string }>,
    apiKey?: string,
    model?: string,
  ) {
    const tokenSet = new Set<string>();
    const valueSet = new Set<string>();
    for (const part of parts || []) {
      [part?.name, part?.vietnameseName, part?.value]
        .filter(Boolean)
        .forEach((t) => {
          this.tokenize(String(t)).forEach((tk) => tokenSet.add(tk));
        });
      if (part?.value) {
        this.extractValueTokens(String(part.value)).forEach((v) =>
          valueSet.add(v),
        );
      }
    }

    const queryTokens = Array.from(tokenSet).slice(0, 12);
    const valueTokens = Array.from(valueSet).slice(0, 12);
    if (!queryTokens.length && !valueTokens.length) return [];

    const index = await this.getProductIndex();
    const scores = this.scoreProducts(index, queryTokens, valueTokens)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);
    const confident = this.assessConfidence(scores, queryTokens, valueTokens);
    const topScores = scores.slice(0, 20);

    const deterministicCards = topScores.map((s) => ({
      productId: s.product.productId,
      name: s.product.name,
      price: s.product.price,
      stock: s.product.stock,
      category: s.product.category,
      code: s.product.code,
      image: s.product.image,
    }));

    if (confident || !apiKey || !model || !scores.length) {
      return deterministicCards;
    }

    // Ambiguous: let AI filter a reduced candidate set
    const aiCandidates = scores.slice(0, 40).map((s) => ({
      _id: s.product.productId,
      name: s.product.name,
      code: s.product.code,
      category: s.product.category,
      description: s.product.description,
      price: { salePrice: s.product.price, originalPrice: s.product.price },
      stock: s.product.stock,
      images: s.product.image ? [s.product.image] : [],
    }));

    try {
      const filteredProducts = await this.filterProductsByAI(
        parts,
        aiCandidates,
        apiKey,
        model,
      );
      return Array.isArray(filteredProducts) ? filteredProducts : [];
    } catch (err) {
      this.logger.warn('Error filtering products by AI', err);
      // Fallback only if deterministic looks confident; otherwise return empty for accuracy
      return confident ? deterministicCards : [];
    }
  }

  private async filterProductsByAI(
    parts: Array<{ name?: string; value?: string; vietnameseName?: string }>,
    products: any[],
    apiKey: string,
    model: string,
  ) {
    const partsJson = JSON.stringify(
      parts.map((p) => ({
        name: p.name,
        value: p.value,
        vietnameseName: p.vietnameseName,
      })),
    );
    const productsJson = JSON.stringify(
      products.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        code: p.code,
        category: p.category,
        description: p.description,
      })),
    );

    const prompt = `Bạn là chuyên gia linh kiện điện tử. 
Dưới đây là danh sách linh kiện được phát hiện từ ảnh và danh sách sản phẩm trong hệ thống.

Linh kiện từ ảnh:
${partsJson}

Sản phẩm trong kho:
${productsJson}

Nhiệm vụ:
1. So sánh mỗi linh kiện từ ảnh với danh sách sản phẩm
2. Chỉ trả về những sản phẩm THỰC SỰ KHỚP hoặc TƯƠNG TỰ với linh kiện trong ảnh
3. Tránh những sản phẩm không liên quan
4. Trả về JSON array chứa các object {id: "product_id", reason: "lý do khớp"}
5. Nếu không có sản phẩm nào khớp, trả về []

Lưu ý:
- LM555 khớp với IC / LM555 trong kho
- Resistor 10k khớp với Điện trở có giá trị 10k
- Capacitor 100µF khớp với Tụ điện có giá trị 100µF
- KHÔNG khớp những sản phẩm hoàn toàn khác loại

Chỉ trả về JSON ARRAY. Không giải thích.`;

    const requestBody: GeminiGenerateContentRequest = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,
      },
    };

    const raw = await this.callGemini(model, apiKey, requestBody);
    const filtered = this.parseFilteredProductsResponse(raw, products);
    return filtered;
  }

  private parseFilteredProductsResponse(raw: string, allProducts: any[]) {
    try {
      let cleaned = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const firstBracket = cleaned.indexOf('[');
      const lastBracket = cleaned.lastIndexOf(']');

      if (
        firstBracket !== -1 &&
        lastBracket !== -1 &&
        lastBracket > firstBracket
      ) {
        cleaned = cleaned.substring(firstBracket, lastBracket + 1);
      } else {
        return [];
      }

      const filtered = JSON.parse(cleaned);
      if (!Array.isArray(filtered)) return [];

      return filtered
        .map((item) => {
          const prod = allProducts.find((p) => p._id.toString() === item.id);
          if (!prod) return null;
          return {
            productId: prod._id.toString(),
            name: prod.name,
            price: prod.price?.salePrice ?? prod.price?.originalPrice ?? 0,
            stock: typeof prod.stock === 'number' ? prod.stock : 0,
            category: prod.category,
            code: prod.code,
            image: Array.isArray(prod.images) ? prod.images[0] : undefined,
          };
        })
        .filter(Boolean);
    } catch (e) {
      this.logger.warn('Error parsing filtered products', e);
      return [];
    }
  }

  private composeVisionReply(
    parts: Array<{
      name?: string;
      value?: string;
      package?: string;
      notes?: string;
      vietnameseName?: string;
    }>,
    products: AiProductCard[],
    raw?: string,
  ) {
    const lines: string[] = [];

    // **Bước 1: Báo linh kiện tìm thấy từ ảnh**
    if (parts.length > 0) {
      lines.push(`📸 Phân tích ảnh: Tìm thấy ${parts.length} linh kiện`);
      lines.push('');
      parts.forEach((p) => {
        const nameDis = [p.vietnameseName, p.name].filter(Boolean).join(' / ');
        const pieces = [nameDis, p.value, p.notes].filter(Boolean).join(' - ');
        lines.push(`• ${pieces || 'Linh kiện'}`);
      });
      lines.push('');
    } else {
      if (raw && raw.length > 10) {
        lines.push(
          '❌ Không thể phân tích JSON từ ảnh. Dữ liệu không rõ ràng:',
        );
        lines.push(raw);
      } else {
        lines.push('❌ Không phát hiện linh kiện nào trong ảnh. Vui lòng:');
        lines.push('• Chụp rõ hơn');
        lines.push('• Chụp sơ đồ mạch hoặc hình ảnh linh kiện thực tế');
        lines.push('• Đảm bảo sáng đủ');
      }
      return lines.join('\n');
    }

    // **Bước 2: Báo sản phẩm tìm được trong kho**
    if (products.length > 0) {
      lines.push('✅ Sản phẩm tìm thấy trong kho:');
      lines.push('');
      products.forEach((p) => {
        const stock = p.stock > 0 ? `✓ Còn ${p.stock}` : '❌ Hết hàng';
        lines.push(
          `• ${p.name} (${p.code || 'N/A'}) - ${p.price} VND - ${stock}`,
        );
      });
    } else {
      // **Bước 3: Báo thiếu linh kiện**
      lines.push('⚠️ CẢNH BÁO: Thiếu linh kiện trong kho');
      lines.push('');
      lines.push('Linh kiện cần tìm:');
      parts.forEach((p) => {
        const nameDis = [p.vietnameseName, p.name].filter(Boolean).join(' / ');
        const pieces = [nameDis, p.value].filter(Boolean).join(' - ');
        lines.push(`• ${pieces || 'Linh kiện'}`);
      });
      lines.push('');
      lines.push('Giải pháp:');
      lines.push('1. Liên hệ bộ phận kỹ thuật để nhập hàng');
      lines.push('2. Tìm linh kiện thay thế tương đương');
      lines.push('3. Kiểm tra lại danh sách linh kiện cần thiết');
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
    const wrapped: PendingAction = {
      id,
      userId,
      action: { ...action, confirmationId: id },
      expiresAt,
    };
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

  private async callGemini(
    model: string,
    apiKey: string,
    body: GeminiGenerateContentRequest,
  ) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await response
      .json()
      .catch(() => ({}))) as GeminiGenerateContentResponse & {
      error?: { message?: string };
    };

    if (!response.ok) {
      const message =
        data?.error?.message || 'Không thể gọi Gemini. Vui lòng thử lại.';
      throw new ServiceUnavailableException(message);
    }

    return (
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join('') ||
      'Mình chưa nhận được phản hồi hợp lệ từ AI. Bạn thử hỏi lại giúp mình nhé.'
    );
  }
}
