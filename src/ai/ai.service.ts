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
import { OrderDocument } from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { UsersService } from '../users/users.service';
import { randomUUID } from 'crypto';
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
      throw new ServiceUnavailableException(
        'AI chưa được cấu hình (thiếu GEMINI_API_KEY)',
      );
    }

    const model = this.config.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';

    // If image is provided, try vision flow first
    if (dto.imageUrl) {
      const { parts, raw } = await this.extractPartsFromImage(
        dto.message,
        dto.imageUrl,
        apiKey,
        model,
      );
      // Pass apiKey and model to AI-filter products
      const allCards = await this.searchProductsByParts(parts, apiKey, model);
      const productCards = allCards.filter(
        (card) => card !== null,
      ) as AiProductCard[];
      const reply = this.composeVisionReply(parts, productCards, raw);
      const actions = this.buildActions(dto.message, productCards, user.sub);
      return { reply, cards: productCards, actions };
    }

    const { contextText, productCards } = await this.buildContext(
      dto.message,
      user,
    );
    const rerankedCards = await this.rerankProducts(
      dto.message,
      productCards,
      model,
      apiKey,
    );
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
    let finalCards = rerankedCards;
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
          // But if we have productCards from search, maybe we should keep them if AI didn't mean to filter all?
          // Instruction says: "Nếu không có sản phẩm phù hợp, trả về []".
          // So if [], we should probably hide cards to respect "Nó chỉ nên hiển thị đúng cái nó trả lời".
          finalCards = [];
        }
      } catch {
        // ignore parse error context
      }
      // Remove the control line from the message presented to user
      reply = rawReply.replace(/RELEVANT_CODES:.*(\n|$)/, '').trim();
    }

    const actions = this.buildActions(dto.message, finalCards, user.sub);

    return { reply, cards: finalCards, actions };
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
      'Chỉ sử dụng dữ liệu được cung cấp trong phần CONTEXT. Không bịa thông tin.',
      'Không yêu cầu/không lưu mật khẩu, OTP, token. Không tiết lộ khóa API.',
      'Không thực hiện hành động thay người dùng (tạo/hủy đơn, thanh toán). Chỉ hướng dẫn thao tác trong app.',
      'ĐỊNH DẠNG BẮT BUỘC: viết thành các bullet ngắn gọn, không dùng ký tự * lặp nhiều lần; dùng dấu "-" đầu dòng. Nếu liệt kê sản phẩm, mỗi sản phẩm 1 dòng: "- Tên | Mã | Giá | Tồn kho". Nếu hướng dẫn, dùng 2-4 bullet ngắn. Không chèn dấu xuống dòng thừa.',
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
      const orderLines = latest.map((o) => {
        const code = o?.code || String(o?._id || '');
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
      const sorted = [...(addresses as AddressContext[])].sort(
        (a, b) => Number(b.isDefault) - Number(a.isDefault),
      );
      parts.push(
        sorted.length
          ? [
              'ĐỊA CHỈ ĐÃ LƯU (ưu tiên địa chỉ mặc định):',
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
            ].join('\n')
          : 'ĐỊA CHỈ ĐÃ LƯU: chưa có địa chỉ nào.',
      );
    }

    const productHints = this.extractKeywords(message);
    if (productHints.length) {
      const orClauses = productHints.map((token) => {
        const rx = this.buildAccentRegex(token);
        return [
          { name: rx },
          { code: rx },
          { category: rx },
          { description: rx },
        ];
      });

      // Try fuzzy AND search first: products that match ALL keywords (in name, code, category or description)
      // This helps when user searches specific items like "Điện trở 10k" -> must have "Điện trở" AND "10k"
      let products: ProductContext[] = [];
      if (productHints.length > 1) {
        const andClauses = orClauses.map((group) => ({ $or: group }));
        products = (await this.productModel
          .find({ $and: andClauses })
          .select({
            name: 1,
            category: 1,
            code: 1,
            price: 1,
            stock: 1,
            images: 1,
          })
          .limit(40)
          .lean()
          .exec()) as ProductContext[];
      }

      // Fallback to broad OR search if no precise match
      if (!products.length) {
        const flatOr = orClauses.flat();
        products = (await this.productModel
          .find(flatOr.length ? { $or: flatOr } : {})
          .select({
            name: 1,
            category: 1,
            code: 1,
            price: 1,
            stock: 1,
            images: 1,
          })
          .limit(40)
          .lean()
          .exec()) as ProductContext[];
      }

      if (products.length) {
        productCards.push(
          ...products.map((p) => ({
            productId: String(p._id),
            name: p.name || '',
            price: p.price?.salePrice ?? p.price?.originalPrice ?? 0,
            stock: typeof p.stock === 'number' ? p.stock : 0,
            category: p.category,
            code: p.code,
            image: Array.isArray(p.images) ? p.images[0] : undefined,
          })),
        );

        parts.push(
          [
            'SẢN PHẨM LIÊN QUAN (tối đa 40):',
            ...products.map((p) => {
              const code = p?.code ? `code=${p.code}` : 'code=N/A';
              const cat = p?.category ? `cat=${p.category}` : 'cat=N/A';
              const price = p?.price?.salePrice ?? p?.price?.originalPrice;
              const priceText =
                typeof price === 'number' ? `${price} VND` : 'N/A';
              const stockText =
                typeof p?.stock === 'number' ? `stock=${p.stock}` : 'stock=N/A';
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
      'dang',
      'đang',
      'het',
    ]);
    const keywords = tokens
      .filter((t) => t.length >= 2 && !stop.has(t))
      .slice(0, 8);
    return Array.from(new Set(keywords));
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildAccentRegex(value: string) {
    const accentMap: Record<string, string> = {
      a: 'aàáạảãăằắặẳẵâầấậẩẫ',
      e: 'eèéẹẻẽêềếệểễ',
      i: 'iìíịỉĩ',
      o: 'oòóọỏõôồốộổỗơờớợởỡ',
      u: 'uùúụủũưừứựửữ',
      y: 'yỳýỵỷỹ',
      d: 'dđ',
    };

    const pattern = value
      .split('')
      .map((ch) => {
        const lower = ch.toLowerCase();
        const group = accentMap[lower];
        if (group) return `[${this.escapeRegExp(group)}]`;
        return this.escapeRegExp(ch);
      })
      .join('');

    return new RegExp(pattern, 'i');
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
    const tokens = parts
      .flatMap((p) => [p.name, p.value, p.vietnameseName])
      .filter(Boolean)
      .map((t) => (t || '').toString().trim())
      .filter((v, i, a) => a.indexOf(v) === i) // Unique
      .slice(0, 20); // Limit to 20 unique tokens

    if (!tokens.length) return [];

    const ors = tokens.map((token) => {
      const rx = this.buildAccentRegex(token);
      return [
        { name: rx },
        { code: rx },
        { category: rx },
        { description: rx },
      ];
    });
    const flatOr = ors.flat();
    const products = await this.productModel
      .find(flatOr.length ? { $or: flatOr } : {})
      .select({
        name: 1,
        category: 1,
        code: 1,
        price: 1,
        stock: 1,
        images: 1,
        description: 1,
      })
      .limit(60)
      .lean()
      .exec();

    if (!products.length) return [];

    // **Bước 3: Lọc qua AI để đảm bảo chỉ lấy linh kiện đúng/tương tự (không fallback bằng text)**
    if (apiKey && model) {
      try {
        const filteredProducts = await this.filterProductsByAI(
          parts,
          products,
          apiKey,
          model,
        );
        // Trả về đúng kết quả AI quyết định (kể cả rỗng)
        return Array.isArray(filteredProducts) ? filteredProducts : [];
      } catch (err) {
        console.warn('Error filtering products by AI:', err);
        // Khi AI lỗi, không trả về text-based fallback
        return [];
      }
    }

    // Nếu không có AI key/model, dùng kết quả tìm kiếm thô (đường lui khi dev)
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
      console.warn('Error parsing filtered products:', e);
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
