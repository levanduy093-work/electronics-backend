# electronics-backend

Backend NestJS cho cửa hàng linh kiện điện tử. Kết nối MongoDB, tổ chức theo module rõ ràng cho từng collection.

## Kiến trúc thư mục
- `src/app.module.ts`: Root module, nạp config và Mongo.
- `src/main.ts`: Bootstrap + ValidationPipe.
- `src/auth`, `src/users`, `src/products`, `src/orders`, `src/carts`, `src/vouchers`, `src/reviews`, `src/transactions`, `src/shipments`, `src/inventory-movements`, `src/chat`, `src/ai`, `src/health`: Module đặc thù.
- `src/common`: Chia sẵn decorators/guards/pipes.
- `src/config`: Đặt cấu hình mở rộng (nếu thêm).

## Cấu hình môi trường
App dùng `@nestjs/config` + Joi validate. Tạo `.env` (hoặc export) với các biến bắt buộc:
```
MONGO_URI=mongodb://<user>:<pass>@localhost:27017/electronics_shop?authSource=admin
JWT_SECRET=<random-32+ chars>       # ký access token 30 phút
REFRESH_SECRET=<random-32+ chars>   # ký refresh token 30 ngày, khác với JWT_SECRET
PORT=3000
CORS_ORIGINS=http://localhost:3000   # danh sách origin, phân tách dấu phẩy (ví dụ thêm https://admin.yourdomain.com)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<smtp-username>
SMTP_PASS=<smtp-password-or-app-password>
SMTP_FROM="Electronics Shop <no-reply@yourdomain.com>"
SMTP_SECURE=false                    # true nếu dùng cổng 465
OTP_TTL_SECONDS=600                  # mặc định 10 phút
OTP_MAX_ATTEMPTS=5                   # khóa OTP nếu nhập sai quá số lần này
```
Không commit `.env`. Secrets cần đủ dài/ngẫu nhiên; có thể tạo bằng `openssl rand -hex 32`.

### Luồng đăng nhập OTP (email)
- Gửi OTP: `POST /auth/send-otp` body `{"email":"<email>","password":"<password>"}` — kiểm tra mật khẩu rồi gửi mã 6 số qua email, TTL mặc định 10 phút.
- Xác minh OTP: `POST /auth/verify-otp` body `{"email":"<email>","code":"123456"}` — trả về `{ user, accessToken, refreshToken }`.
- Giới hạn: tối đa 5 lần nhập sai (config `OTP_MAX_ATTEMPTS`), có throttle per-endpoint.

## Bảo mật đã bật
- Bắt buộc thiết lập `MONGO_URI` và `JWT_SECRET` qua biến môi trường; thiếu sẽ không khởi động.
- HTTP hardening: `helmet`, CORS (origin động, cho phép credentials), giới hạn tốc độ 100 request/phút qua `@nestjs/throttler`.
- ValidationPipe bật `whitelist`, `forbidNonWhitelisted`, chuyển đổi kiểu; mật khẩu tối thiểu 8 ký tự; đăng ký không nhận trường `role`.
- Auth: JWT guard + Roles guard; login trả về user đã được ẩn `passwordHashed`; JWT validate kiểm tra user còn tồn tại.
- Phân quyền/ownership: users/products/vouchers/transactions/inventory-movements/shipments và thao tác cập nhật/xóa review yêu cầu `admin`; carts/orders/chat chỉ truy cập dữ liệu của chính user (admin bỏ qua kiểm tra).
- Auth: Access token TTL 30 phút; refresh token TTL 30 ngày. Endpoint làm mới token: `POST /auth/refresh` (body: `{ "refreshToken": "<token>" }`). Login/register trả về `{ user, accessToken, refreshToken }`.
- Review ràng buộc user: `userId` lấy từ JWT, không cho client tự đính kèm tên/ảnh.

## Cài đặt & chạy
```bash
npm install
npm run start:dev   # hot reload
# hoặc
npm run start       # chạy thường
```

## API hiện có (REST)
Base URL: `http://localhost:${PORT:-3000}`

- **Health**
  - `GET /health`

- **Auth**
  - `POST /auth/register` (public) — name, email, password, avatar?, role?, address?
  - `POST /auth/login` (public) — email, password → `{ accessToken, user }`
  - `POST /auth/send-otp` (public) — email, password → gửi OTP 6 số qua email (TTL mặc định 10 phút, tối đa 5 lần nhập sai)
  - `POST /auth/verify-otp` (public) — email, code → `{ accessToken, refreshToken, user }` (đăng nhập bằng OTP sau khi đã xác thực email + password ở bước gửi OTP)
  - Với các API còn lại: gửi header `Authorization: Bearer <accessToken>`

- **Users**
  - `POST /users` tạo user (name, email, password, avatar?, role?, address[]); server sẽ hash
  - `GET /users` danh sách (ẩn passwordHashed)
  - `GET /users/:id` chi tiết
  - `PATCH /users/:id` cập nhật
  - `DELETE /users/:id` xóa
  - `POST /users/:id/address` thêm địa chỉ
  - `PATCH /users/:id/address/:index/default` đặt địa chỉ mặc định

- **Products**
  - `POST /products` (name, price{originalPrice,salePrice}, category?, description?, images?, specs?, stock?, code?, datasheet?)
  - `GET /products`
  - `GET /products/:id`
  - `PATCH /products/:id`
  - `DELETE /products/:id`

- **Vouchers**
  - `POST /vouchers` (code, description?, discountPrice, minTotal, expire)
  - `GET /vouchers`
  - `GET /vouchers/:id`
  - `PATCH /vouchers/:id`
  - `DELETE /vouchers/:id`

- **Carts**
  - `POST /carts` (userId, items[{productId,quantity,price,name?,category?,image?}], voucher?, totals?)
  - `GET /carts`
  - `GET /carts/:id`
  - `PATCH /carts/:id`
  - `DELETE /carts/:id`

- **Orders**
  - `POST /orders` (code, userId, status dates?, isCancelled?, shippingAddress?, items[{productId,name,quantity,price,subTotal,shippingFee?,discount?,totalPrice}], voucher?, subTotal, shippingFee, discount, totalPrice, payment?, paymentStatus?)
  - `GET /orders`
  - `GET /orders/:id`
  - `PATCH /orders/:id`
  - `DELETE /orders/:id`

- **Reviews**
  - `POST /reviews` (productId, rating, comment?, images?, user{avatar?,name?}?)
  - `GET /reviews`
  - `GET /reviews/:id`
  - `PATCH /reviews/:id`
  - `DELETE /reviews/:id`

- **Transactions**
  - `POST /transactions` (orderId, userId, provider, amount, currency, status, paidAt?)
  - `GET /transactions`
  - `GET /transactions/:id`
  - `PATCH /transactions/:id`
  - `DELETE /transactions/:id`

- **Shipments**
  - `POST /shipments` (orderId, carrier, trackingNumber, status, statusHistory?, expectedDelivery?)
  - `GET /shipments`
  - `GET /shipments/:id`
  - `PATCH /shipments/:id`
  - `DELETE /shipments/:id`

- **Inventory movements**
  - `POST /inventory-movements` (productId, type[inbound|outbound], quantity, note?)
  - `GET /inventory-movements`
  - `GET /inventory-movements/:id`
  - `PATCH /inventory-movements/:id`
  - `DELETE /inventory-movements/:id`

- **Chat session**
  - `POST /chat` (userId, messages[{role,time?,content{text?,images[]?}}]?)
  - `GET /chat`
  - `GET /chat/:id`
  - `PATCH /chat/:id`
  - `POST /chat/:id/messages` thêm tin nhắn
  - `DELETE /chat/:id`

## Test nhanh (curl)
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

## Ghi chú phát triển tiếp
- JWT Guard đã bật global, chỉ `/health` và `/auth/*` là public. Cân nhắc phân quyền role (admin/customer) và kiểm tra quyền sở hữu tài nguyên.
- Bổ sung enum/ràng buộc nghiệp vụ (status, type) và validate foreign key khi cần.
- Thêm test cho auth và các module.
