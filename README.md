# Electronics Backend API

Backend REST API được xây dựng bằng **NestJS** và **MongoDB** cho hệ thống cửa hàng linh kiện điện tử. Cung cấp API cho ứng dụng mobile `ElectronicsShop` và web admin `electronics-admin`.

## 📋 Mục lục

- [Tổng quan](#tổng-quan)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Tính năng](#tính-năng)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [API Documentation](#api-documentation)
- [Socket.IO Events](#socketio-events)
- [Bảo mật](#bảo-mật)
- [Testing](#testing)
- [Deployment](#deployment)

---

## 🎯 Tổng quan

Electronics Backend là một hệ thống backend hoàn chỉnh cung cấp:

- **RESTful API** cho các chức năng quản lý cửa hàng điện tử
- **Real-time communication** qua Socket.IO
- **Authentication & Authorization** với JWT và role-based access control
- **Payment integration** với VNPay
- **AI integration** với Google Gemini API
- **File upload** với Cloudinary
- **Push notifications** với Firebase Cloud Messaging (FCM)
- **Email service** với Nodemailer cho OTP và thông báo

---

## 🛠 Công nghệ sử dụng

### Core Framework
- **NestJS** (v11.x) - Progressive Node.js framework
- **TypeScript** - Type-safe JavaScript
- **MongoDB** với **Mongoose** - NoSQL database

### Authentication & Security
- **Passport.js** + **JWT** - Authentication strategy
- **bcrypt** - Password hashing
- **Helmet** - Security headers
- **@nestjs/throttler** - Rate limiting

### Third-party Services
- **Cloudinary** - Image upload & management
- **Firebase Admin SDK** - Push notifications (FCM)
- **Nodemailer** - Email service (OTP, notifications)
- **VNPay** - Payment gateway
- **Google Gemini API** - AI chat & circuit analysis

### Real-time
- **Socket.IO** - WebSocket communication
- **@nestjs/websockets** - WebSocket module

### Validation & Configuration
- **class-validator** + **class-transformer** - DTO validation
- **Joi** - Environment variable validation
- **@nestjs/config** - Configuration management

---

## ✨ Tính năng

### 🔐 Authentication & Authorization
- Đăng ký/Đăng nhập với email và password
- Đăng ký qua OTP email
- JWT access token (30 phút) và refresh token (30 ngày)
- Role-based access control (admin, user)
- Đổi mật khẩu và reset mật khẩu qua OTP
- Global JWT guard với public endpoints

### 👥 User Management
- Quản lý thông tin người dùng
- Quản lý địa chỉ giao hàng
- Upload avatar
- Phân quyền theo role

### 📦 Product Management
- CRUD sản phẩm
- Quản lý hình ảnh sản phẩm
- Thông số kỹ thuật chi tiết
- Quản lý tồn kho
- Tìm kiếm và lọc sản phẩm

### 🛒 Shopping Features
- Giỏ hàng theo user
- Quản lý đơn hàng với nhiều trạng thái
- Mã giảm giá (vouchers)
- Đánh giá và rating sản phẩm
- Lịch sử mua hàng

### 💳 Payment
- Tích hợp VNPay
- Tạo payment URL
- Xử lý callback và IPN từ VNPay
- Quản lý giao dịch thanh toán

### 🚚 Shipment
- Quản lý vận chuyển
- Tracking đơn hàng
- Lịch sử trạng thái vận chuyển

### 📊 Inventory Management
- Nhập/xuất kho
- Theo dõi biến động tồn kho
- Lịch sử inventory movements

### 💬 Chat & AI
- Chat với AI (Gemini API)
- Phân tích sơ đồ mạch điện tử
- Lưu lịch sử chat
- Quản lý phiên chat

### 🔔 Notifications
- Tạo và gửi thông báo
- Push notifications qua FCM
- Quản lý trạng thái đọc/chưa đọc
- Thông báo theo target (user, role, all)

### 🎨 Banners
- Quản lý banners cho homepage
- Sắp xếp thứ tự hiển thị
- Public API cho client

### 📤 File Upload
- Upload hình ảnh lên Cloudinary
- Upload từ URL
- Tổ chức file theo folder
- Validation kích thước và định dạng

### 🔄 Real-time Updates
- Socket.IO gateway
- Real-time database change listeners
- Broadcast events đến clients
- Product updates, order status changes, etc.

### ❤️ Health Check
- Health check endpoint (`/health`)
- Kiểm tra kết nối MongoDB

---

## 🚀 Cài đặt và chạy

### Yêu cầu hệ thống
- Node.js >= 18.x
- MongoDB >= 5.x (hoặc MongoDB Atlas)
- npm hoặc yarn

### Cài đặt

```bash
# Clone repository
cd electronics-backend

# Cài đặt dependencies
npm install

# Tạo file .env (xem phần Cấu hình môi trường)
cp .env.example .env
# Chỉnh sửa .env với thông tin của bạn

# Chạy development server
npm run start:dev

# Hoặc build và chạy production
npm run build
npm run start:prod
```

Server mặc định chạy tại `http://localhost:3000`

### Scripts có sẵn

```bash
npm run build          # Build project
npm run start          # Start production server
npm run start:dev      # Start development server với hot reload
npm run start:debug    # Start với debug mode
npm run start:prod     # Start production server từ dist/
npm run lint           # Lint code
npm run format         # Format code với Prettier
npm run test           # Chạy unit tests
npm run test:watch     # Chạy tests với watch mode
npm run test:cov       # Chạy tests với coverage
npm run test:e2e       # Chạy e2e tests
```

---

## ⚙️ Cấu hình môi trường

Tạo file `.env` trong thư mục `electronics-backend` với các biến sau:

### Biến bắt buộc

```bash
# Database
MONGO_URI=mongodb://<user>:<pass>@localhost:27017/electronics_shop?authSource=admin
# Hoặc MongoDB Atlas:
# MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/electronics_shop

# JWT Secrets (tạo bằng: openssl rand -hex 32)
JWT_SECRET=<random-32+ chars>
REFRESH_SECRET=<random-32+ chars>  # Khác với JWT_SECRET

# Server
PORT=3000
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:19006

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your-email@gmail.com>
SMTP_PASS=<app-password>  # Sử dụng App Password cho Gmail
SMTP_FROM="Electronics Shop <no-reply@yourdomain.com>"
SMTP_SECURE=false

# OTP Configuration
OTP_TTL_SECONDS=600        # Thời gian sống của OTP (10 phút)
OTP_MAX_ATTEMPTS=5         # Số lần thử OTP tối đa

# Cloudinary (Upload images)
CLOUDINARY_CLOUD_NAME=<your-cloud-name>
CLOUDINARY_API_KEY=<your-api-key>
CLOUDINARY_API_SECRET=<your-api-secret>
```

### Biến tùy chọn (tích hợp bên thứ ba)

```bash
# Firebase / FCM (Push Notifications)
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY=<service-account-private-key>

# VNPay (Payment)
VNP_TMN_CODE=<vnpay-tmn-code>
VNP_HASH_SECRET=<vnpay-hash-secret>
VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNP_RETURN_URL=http://localhost:3000/payments/vnpay/return
VNP_IPN_URL=http://localhost:3000/payments/vnpay/ipn

# Gemini API (AI)
GEMINI_API_KEY=<gemini-api-key>
GEMINI_MODEL=gemini-pro  # Mặc định: gemini-pro

# App URL (cho các callback)
APP_URL=http://localhost:3000
```

### Tạo JWT Secret

```bash
# Tạo secret ngẫu nhiên 32 ký tự
openssl rand -hex 32
```

---

## 📁 Cấu trúc dự án

```
electronics-backend/
├── src/
│   ├── main.ts                    # Bootstrap ứng dụng
│   ├── app.module.ts              # Root module
│   │
│   ├── auth/                      # Authentication & Authorization
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── mail.service.ts        # Email service
│   │   ├── otp.service.ts         # OTP management
│   │   ├── dto/                   # Data Transfer Objects
│   │   └── schemas/               # OTP schema
│   │
│   ├── users/                     # User Management
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.module.ts
│   │   ├── dto/
│   │   └── schemas/
│   │
│   ├── products/                  # Product Management
│   ├── carts/                     # Shopping Cart
│   ├── orders/                    # Order Management
│   ├── vouchers/                  # Voucher/Discount Codes
│   ├── reviews/                   # Product Reviews
│   ├── transactions/             # Payment Transactions
│   ├── shipments/                 # Shipment & Tracking
│   ├── inventory-movements/       # Inventory Management
│   ├── payments/                  # Payment Gateway (VNPay)
│   ├── chat/                      # Chat Sessions
│   ├── ai/                        # AI Integration (Gemini)
│   ├── notifications/            # Notifications & FCM
│   ├── banners/                   # Homepage Banners
│   ├── upload/                    # File Upload (Cloudinary)
│   ├── events/                    # Socket.IO Gateway
│   ├── health/                    # Health Check
│   │
│   ├── common/                    # Shared utilities
│   │   ├── decorators/           # Custom decorators (@CurrentUser, @Roles, @Public)
│   │   ├── guards/               # Auth guards (JwtAuthGuard, RolesGuard)
│   │   ├── pipes/                # Custom pipes (ParseObjectIdPipe)
│   │   ├── strategies/           # Passport strategies (JWT)
│   │   ├── types/                # TypeScript types
│   │   ├── utils/                # Utility functions
│   │   └── firebase/             # Firebase module
│   │
│   ├── cloudinary/               # Cloudinary service
│   └── config/                   # Configuration
│
├── test/                         # E2E tests
├── dist/                         # Compiled output
├── .env                          # Environment variables (không commit)
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📚 API Documentation

Base URL: `http://localhost:${PORT:-3000}`

Tất cả endpoints (trừ `/health` và `/auth/*`) yêu cầu JWT token trong header:
```
Authorization: Bearer <access_token>
```

### Health Check

```
GET /health
```
Kiểm tra trạng thái server và kết nối MongoDB.

---

### Authentication

#### Đăng ký
```
POST /auth/register
Body: {
  "name": "string",
  "email": "string",
  "password": "string"  // min 8 chars
}
```

#### Đăng ký qua OTP
```
POST /auth/register/send-otp
Body: {
  "name": "string",
  "email": "string",
  "password": "string"
}

POST /auth/register/verify-otp
Body: {
  "email": "string",
  "otp": "string"
}
```

#### Đăng nhập
```
POST /auth/login
Body: {
  "email": "string",
  "password": "string"
}
Response: {
  "user": {...},
  "accessToken": "string",
  "refreshToken": "string"
}
```

#### Refresh Token
```
POST /auth/refresh
Body: {
  "refreshToken": "string"
}
```

#### Đổi mật khẩu
```
POST /auth/change-password/send-otp
POST /auth/change-password/verify-otp
POST /auth/change-password
```

#### Reset mật khẩu
```
POST /auth/reset-password/send-otp
POST /auth/reset-password/verify-otp
POST /auth/reset-password
```

---

### Users

```
GET    /users              # Lấy danh sách users (admin only)
GET    /users/:id          # Lấy thông tin user
PATCH  /users/:id          # Cập nhật user
DELETE /users/:id          # Xóa user (admin only)
POST   /users/:id/address  # Thêm địa chỉ giao hàng
PATCH  /users/:id/address/:index/default  # Đặt địa chỉ mặc định
```

---

### Products

```
POST   /products           # Tạo sản phẩm (admin only)
GET    /products           # Lấy danh sách sản phẩm (có query params: page, limit, search, category)
GET    /products/:id       # Lấy chi tiết sản phẩm
PATCH  /products/:id       # Cập nhật sản phẩm (admin only)
DELETE /products/:id      # Xóa sản phẩm (admin only)
```

---

### Carts

```
POST   /carts              # Tạo/thêm vào giỏ hàng
GET    /carts              # Lấy giỏ hàng của user hiện tại
GET    /carts/:id          # Lấy chi tiết giỏ hàng
PATCH  /carts/:id          # Cập nhật giỏ hàng
DELETE /carts/:id          # Xóa item khỏi giỏ hàng
```

---

### Orders

```
POST   /orders             # Tạo đơn hàng
GET    /orders             # Lấy danh sách đơn hàng (của user hoặc tất cả nếu admin)
GET    /orders/:id         # Lấy chi tiết đơn hàng
PATCH  /orders/:id         # Cập nhật đơn hàng (admin only)
DELETE /orders/:id         # Xóa đơn hàng (admin only)
```

---

### Vouchers

```
POST   /vouchers           # Tạo voucher (admin only)
GET    /vouchers           # Lấy danh sách vouchers
GET    /vouchers/:id       # Lấy chi tiết voucher
PATCH  /vouchers/:id       # Cập nhật voucher (admin only)
DELETE /vouchers/:id       # Xóa voucher (admin only)
```

---

### Reviews

```
POST   /reviews            # Tạo đánh giá sản phẩm
GET    /reviews            # Lấy danh sách đánh giá (có filter theo productId)
GET    /reviews/:id        # Lấy chi tiết đánh giá
PATCH  /reviews/:id        # Cập nhật đánh giá
DELETE /reviews/:id        # Xóa đánh giá
```

---

### Payments

#### Tạo payment URL (VNPay)
```
POST /payments/vnpay/create
Body: {
  "items": [...],
  "totalPrice": number,
  "voucherId": "string",
  "shippingAddress": {...},
  "bankCode": "string",      // optional
  "locale": "vn"             // optional
}
Response: {
  "paymentUrl": "string",
  "order": {...},
  "transactionId": "string",
  "paymentCode": "string"
}
```

#### Callback từ VNPay
```
GET /payments/vnpay/return
POST /payments/vnpay/ipn
```

---

### Transactions

```
POST   /transactions       # Tạo transaction
GET    /transactions       # Lấy danh sách transactions
GET    /transactions/:id   # Lấy chi tiết transaction
PATCH  /transactions/:id   # Cập nhật transaction
DELETE /transactions/:id   # Xóa transaction
```

---

### Shipments

```
POST   /shipments          # Tạo shipment
GET    /shipments          # Lấy danh sách shipments
GET    /shipments/:id      # Lấy chi tiết shipment
PATCH  /shipments/:id      # Cập nhật shipment
DELETE /shipments/:id      # Xóa shipment
```

---

### Inventory Movements

```
POST   /inventory-movements        # Tạo inventory movement
GET    /inventory-movements        # Lấy danh sách movements
GET    /inventory-movements/:id    # Lấy chi tiết movement
PATCH  /inventory-movements/:id    # Cập nhật movement
DELETE /inventory-movements/:id    # Xóa movement
```

---

### Chat

```
POST   /chat               # Tạo phiên chat
GET    /chat               # Lấy danh sách chat sessions của user
GET    /chat/:id           # Lấy chi tiết chat session
PATCH  /chat/:id           # Cập nhật chat session
POST   /chat/:id/messages  # Thêm message vào chat
DELETE /chat/:id           # Xóa chat session
```

---

### AI

```
POST /ai/chat              # Chat với AI (Gemini)
Body: {
  "message": "string",
  "chatId": "string",      // optional
  "imageUrl": "string"     // optional - cho phân tích sơ đồ mạch
}

POST /ai/confirm           # Xác nhận kết quả AI
Body: {
  "chatId": "string",
  "confirmed": boolean
}
```

---

### Notifications

```
POST   /notifications      # Tạo notification (admin only)
GET    /notifications      # Lấy danh sách notifications của user
GET    /notifications/:id   # Lấy chi tiết notification
PATCH  /notifications/:id  # Cập nhật trạng thái đọc
DELETE /notifications/:id  # Xóa notification
```

---

### Banners

```
GET    /banners/public     # Lấy danh sách banners công khai (public)
POST   /banners            # Tạo banner (admin only)
GET    /banners            # Lấy tất cả banners (admin only)
PATCH  /banners/:id        # Cập nhật banner (admin only)
PATCH  /banners/reorder    # Sắp xếp lại thứ tự banners (admin only)
DELETE /banners/:id        # Xóa banner (admin only)
```

---

### Upload

```
POST /upload/image         # Upload hình ảnh từ file
Content-Type: multipart/form-data
Body: {
  file: File,
  folder?: string          // query param
}

POST /upload/image/by-url  # Upload hình ảnh từ URL
Body: {
  "url": "string"
}
Query: folder?: string
```

---

## 🔌 Socket.IO Events

Server hỗ trợ real-time communication qua Socket.IO.

### Kết nối

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'  // Optional: để authenticate
  }
});
```

### Events từ Server

#### `product_updated`
Khi sản phẩm được cập nhật:
```javascript
socket.on('product_updated', (product) => {
  console.log('Product updated:', product);
});
```

#### `order_status_changed`
Khi trạng thái đơn hàng thay đổi:
```javascript
socket.on('order_status_changed', (order) => {
  console.log('Order status changed:', order);
});
```

#### `notification`
Khi có thông báo mới:
```javascript
socket.on('notification', (notification) => {
  console.log('New notification:', notification);
});
```

### Database Change Listeners

Server tự động lắng nghe thay đổi từ MongoDB và broadcast events đến clients qua Socket.IO.

---

## 🔒 Bảo mật

### Authentication Flow

1. User đăng nhập → nhận `accessToken` (30 phút) và `refreshToken` (30 ngày)
2. Gửi `accessToken` trong header `Authorization: Bearer <token>` cho các protected endpoints
3. Khi `accessToken` hết hạn → dùng `refreshToken` để lấy token mới

### Authorization

- **Public endpoints**: `/health`, `/auth/*`, `/banners/public`
- **User endpoints**: Hầu hết các endpoints cần authentication
- **Admin endpoints**: Các endpoints quản lý (products, orders, users, etc.) yêu cầu role `admin`

### Security Features

- ✅ **Helmet** - Security headers
- ✅ **CORS** - Chỉ cho phép origins được cấu hình
- ✅ **Rate Limiting** - 100 requests/phút/IP
- ✅ **Password Hashing** - bcrypt với salt rounds
- ✅ **JWT** - Signed tokens với expiration
- ✅ **Input Validation** - class-validator với whitelist
- ✅ **SQL Injection Protection** - Mongoose ODM
- ✅ **XSS Protection** - Helmet + input sanitization

### Best Practices

- Không commit `.env` file
- Sử dụng secrets mạnh (32+ ký tự ngẫu nhiên)
- Bật HTTPS trong production
- Giới hạn CORS origins
- Monitor rate limiting
- Regular security updates

---

## 🧪 Testing

### Unit Tests

```bash
npm run test
npm run test:watch
npm run test:cov
```

### E2E Tests

```bash
npm run test:e2e
```

### Test với curl

```bash
# 1. Đăng ký
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "12345678"
  }'

# 2. Đăng nhập
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "12345678"
  }' | jq -r '.accessToken')

# 3. Gọi API protected
curl http://localhost:3000/users \
  -H "Authorization: Bearer $TOKEN"

# 4. Health check
curl http://localhost:3000/health
```

---

## 🚢 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Cấu hình MongoDB Atlas hoặc production MongoDB
- [ ] Set strong JWT secrets
- [ ] Cấu hình CORS origins cho production domains
- [ ] Cấu hình SMTP cho production email
- [ ] Set up Cloudinary production account
- [ ] Cấu hình VNPay production credentials
- [ ] Enable HTTPS
- [ ] Set up monitoring và logging
- [ ] Configure backup cho MongoDB
- [ ] Set up CI/CD pipeline

### Build cho Production

```bash
npm run build
npm run start:prod
```

### Docker (Optional)

Có thể tạo `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
```

---

## 📝 Ghi chú phát triển

### Thêm Module mới

1. Tạo module với NestJS CLI:
```bash
nest generate module <module-name>
nest generate controller <module-name>
nest generate service <module-name>
```

2. Import module vào `app.module.ts`

3. Tạo schema trong `schemas/` nếu cần MongoDB model

4. Tạo DTOs trong `dto/` với validation

5. Implement controller và service

### Decorators hữu ích

- `@Public()` - Đánh dấu endpoint là public (không cần auth)
- `@Roles('admin')` - Yêu cầu role cụ thể
- `@CurrentUser()` - Lấy user từ JWT token

### Database Schema

Tất cả schemas sử dụng Mongoose và được định nghĩa trong thư mục `schemas/` của mỗi module.

---

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📄 License

UNLICENSED - Private project

---

## 📞 Support

Nếu có vấn đề hoặc câu hỏi, vui lòng tạo issue trên repository.

---

**Made with ❤️ using NestJS**
