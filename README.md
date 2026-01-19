## electronics-backend – Backend NestJS cho Electronics Shop

`electronics-backend` là **backend REST API** dùng NestJS + MongoDB cho hệ thống cửa hàng linh kiện điện tử:

- Cung cấp API cho **ứng dụng mobile `ElectronicsShop`** và **web admin `electronics-admin`**.
- Xử lý **auth, giỏ hàng, đơn hàng, thanh toán, giao vận, tồn kho, thông báo, chat, AI, FCM, Socket.IO**.

---

## 1. Kiến trúc thư mục

- `src/app.module.ts`: Root module, cấu hình MongoDB, nạp các module con.
- `src/main.ts`: Bootstrap ứng dụng Nest, bật `ValidationPipe`, `helmet`, CORS, throttler.
- Các module chính:
  - `src/auth`: Auth, JWT, refresh token, OTP qua email, đổi mật khẩu, reset mật khẩu.
  - `src/users`: User, hồ sơ, địa chỉ giao hàng, phân quyền `role`.
  - `src/products`: Sản phẩm, thông số kỹ thuật, hình ảnh, tồn kho cơ bản.
  - `src/carts`: Giỏ hàng theo user.
  - `src/orders`: Đơn hàng, trạng thái, tổng tiền.
  - `src/vouchers`: Mã giảm giá, điều kiện áp dụng.
  - `src/reviews`: Đánh giá sản phẩm, rating, comment, hình ảnh.
  - `src/transactions`: Giao dịch thanh toán.
  - `src/shipments`: Vận chuyển, tracking, lịch sử trạng thái.
  - `src/inventory-movements`: Nhập/xuất kho.
  - `src/chat`: Phiên chat, lịch sử tin nhắn với AI.
  - `src/ai`: Tầng tích hợp AI (Gemini API) cho chat/scan sơ đồ mạch.
  - `src/notifications`: Thông báo, trạng thái người dùng đã đọc/chưa đọc.
  - `src/events`: Socket.IO gateway + lắng nghe thay đổi DB.
  - `src/upload`: Upload file/hình ảnh (Cloudinary).
  - `src/health`: Health check (`GET /health`).
- `src/common`: 
  - Decorators, guards, pipes, helpers được dùng chung.
- `src/config`: 
  - Tài liệu hướng dẫn cấu hình, có thể mở rộng thêm module config riêng.

---

## 2. Cấu hình môi trường (`.env`)

App dùng `@nestjs/config` + Joi để validate cấu hình. Tạo `electronics-backend/.env` với các biến tối thiểu:

```bash
MONGO_URI=mongodb://<user>:<pass>@localhost:27017/electronics_shop?authSource=admin
JWT_SECRET=<random-32+ chars>       # ký access token 30 phút
REFRESH_SECRET=<random-32+ chars>   # ký refresh token 30 ngày, khác với JWT_SECRET
PORT=3000
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:19006

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<smtp-username>
SMTP_PASS=<smtp-password-or-app-password>
SMTP_FROM="Electronics Shop <no-reply@yourdomain.com>"
SMTP_SECURE=false

OTP_TTL_SECONDS=600
OTP_MAX_ATTEMPTS=5
```

Không commit `.env`. Secrets cần đủ dài/ngẫu nhiên; có thể tạo bằng:

```bash
openssl rand -hex 32
```

### 2.1. Biến môi trường mở rộng (tích hợp bên thứ ba)

Tuỳ theo mức độ sử dụng, có thể thêm:

```bash
# Firebase / FCM
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY=<service-account-private-key>

# Cloudinary (upload ảnh)
CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>

# Payment (ví dụ VNPay)
VNPAY_TMN_CODE=<vnpay-tmn-code>
VNPAY_HASH_SECRET=<vnpay-hash-secret>
VNPAY_RETURN_URL=http://localhost:3000/payments/return

# Gemini API cho AI
GEMINI_API_KEY=<gemini-api-key>
```

---

## 3. Auth & bảo mật

- **Login**:
  - Đăng nhập dùng email + password (OTP không áp dụng cho login).
  - Trả về `{ user, accessToken, refreshToken }`.
- **Đăng ký**:
  - Đăng ký thẳng: `POST /auth/register` (public).
  - Đăng ký qua OTP:
    - `POST /auth/register/send-otp` — lưu tạm thông tin + gửi OTP, chưa tạo user.
    - `POST /auth/register/verify-otp` — xác minh OTP, tạo user và trả token.
- **JWT & Guard**:
  - Dùng access token TTL ~30 phút, refresh token ~30 ngày.
  - Endpoint refresh: `POST /auth/refresh` (body `{ refreshToken }`).
  - JWT guard + Roles guard bật global, chỉ `/health` và `/auth/*` là public.
- **Validation & Hardening**:
  - `ValidationPipe` bật `whitelist`, `forbidNonWhitelisted`, transform type.
  - Mật khẩu tối thiểu 8 ký tự; client không thể gửi trường `role` tuỳ tiện khi đăng ký (được kiểm soát server-side).
  - Bật `helmet`, CORS với danh sách origin từ `CORS_ORIGINS`.
  - Throttler giới hạn request / IP (ví dụ 100 req/phút).

---

## 4. Cài đặt & chạy

```bash
cd electronics-backend

# Cài dependencies
npm install

# Chạy dev với hot reload
npm run start:dev

# Hoặc build + chạy production
npm run build
npm run start:prod
```

Mặc định server chạy tại `http://localhost:3000`.

---

## 5. Các nhóm API chính (REST)

Base URL: `http://localhost:${PORT:-3000}`

- **Health**
  - `GET /health`

- **Auth**
  - `POST /auth/register`
  - `POST /auth/register/send-otp`
  - `POST /auth/register/verify-otp`
  - `POST /auth/login`
  - `POST /auth/refresh`

- **Users**
  - `POST /users`
  - `GET /users`
  - `GET /users/:id`
  - `PATCH /users/:id`
  - `DELETE /users/:id`
  - `POST /users/:id/address`
  - `PATCH /users/:id/address/:index/default`

- **Products**
  - `POST /products`
  - `GET /products`
  - `GET /products/:id`
  - `PATCH /products/:id`
  - `DELETE /products/:id`

- **Vouchers**
  - `POST /vouchers`
  - `GET /vouchers`
  - `GET /vouchers/:id`
  - `PATCH /vouchers/:id`
  - `DELETE /vouchers/:id`

- **Carts**
  - `POST /carts`
  - `GET /carts`
  - `GET /carts/:id`
  - `PATCH /carts/:id`
  - `DELETE /carts/:id`

- **Orders**
  - `POST /orders`
  - `GET /orders`
  - `GET /orders/:id`
  - `PATCH /orders/:id`
  - `DELETE /orders/:id`

- **Reviews**
  - `POST /reviews`
  - `GET /reviews`
  - `GET /reviews/:id`
  - `PATCH /reviews/:id`
  - `DELETE /reviews/:id`

- **Transactions**
  - `POST /transactions`
  - `GET /transactions`
  - `GET /transactions/:id`
  - `PATCH /transactions/:id`
  - `DELETE /transactions/:id`

- **Shipments**
  - `POST /shipments`
  - `GET /shipments`
  - `GET /shipments/:id`
  - `PATCH /shipments/:id`
  - `DELETE /shipments/:id`

- **Inventory movements**
  - `POST /inventory-movements`
  - `GET /inventory-movements`
  - `GET /inventory-movements/:id`
  - `PATCH /inventory-movements/:id`
  - `DELETE /inventory-movements/:id`

- **Chat session**
  - `POST /chat`
  - `GET /chat`
  - `GET /chat/:id`
  - `PATCH /chat/:id`
  - `POST /chat/:id/messages`
  - `DELETE /chat/:id`

---

## 6. Test nhanh (curl)

```bash
# 1) Đăng ký (public)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"12345678"}'

# 2) Đăng nhập để lấy token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"12345678"}' | jq -r '.accessToken')

# 3) Gọi API cần bảo vệ
curl http://localhost:3000/users \
  -H "Authorization: Bearer $TOKEN"
```

---

## 7. Ghi chú phát triển tiếp

- JWT Guard đã bật global, chỉ `/health` và `/auth/*` là public → nên cân nhắc decor `@Public()` thêm cho một số endpoint nếu cần mở.
- Cần hoàn thiện thêm enum/ràng buộc nghiệp vụ (status, type) và validate foreign key giữa các collection.
- Nên bổ sung thêm test unit/e2e cho `auth`, `orders`, `payments`, `inventory-movements` để đảm bảo logic nghiệp vụ.
