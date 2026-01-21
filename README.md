# Electronics Backend API

Backend REST API mạnh mẽ và hiện đại được xây dựng bằng **NestJS** và **MongoDB**, phục vụ cho hệ thống cửa hàng linh kiện điện tử. Hệ thống cung cấp API toàn diện cho ứng dụng mobile `ElectronicsShop` và web admin `electronics-admin`.

Dự án không chỉ là một API thương mại điện tử tiêu chuẩn mà còn tích hợp các công nghệ tiên tiến như **AI (Google Gemini)** để phân tích mạch điện và tư vấn, **Real-time** update trạng thái kho/đơn hàng, và hệ thống **Thanh toán điện tử** hoàn chỉnh.

---

## 📋 Mục lục

- [Tổng quan](#tổng-quan)
- [Tính năng nổi bật](#tính-năng-nổi-bật)
- [Công nghệ cốt lõi](#công-nghệ-cốt-lõi)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [API Documentation](#api-documentation)
- [Liên hệ](#liên-hệ)

---

## 🎯 Tổng quan

Electronics Backend được thiết kế theo kiến trúc module, dễ dàng mở rộng và bảo trì. Hệ thống giải quyết các bài toán phức tạp trong quản lý kho vận, đồng bộ trạng thái thời gian thực và trải nghiệm người dùng thông minh.

### Điểm nhấn:
- **Thông minh:** Tích hợp AI để tư vấn sản phẩm và "nhìn" sơ đồ mạch điện.
- **Tức thời:** Mọi thay đổi về tồn kho, đơn hàng đều được cập nhật realtime tới client.
- **An toàn:** Quy trình thanh toán, authentication và giao dịch được bảo mật chặt chẽ.

---

## ✨ Tính năng nổi bật

### 1. 🤖 AI & Intelligent Features (Google Gemini Integration)
Hệ thống sử dụng Gemini 2.5 Flash và Gemini 3.0 Flash Preview để mang lại trải nghiệm độc đáo:
- **Chatbot tư vấn thông minh:** Hiểu ngữ cảnh lịch sử mua hàng và địa chỉ của user để tư vấn.
- **Reranking:** Sắp xếp lại kết quả tìm kiếm sản phẩm dựa trên độ phù hợp ngữ nghĩa với câu hỏi của người dùng.
- **Phân tích sơ đồ mạch (Circuit Analysis):** Người dùng có thể upload ảnh sơ đồ nguyên lý hoặc PCB, AI sẽ:
    - Nhận diện linh kiện (Tên, giá trị, mã).
    - Mapping sang tên tiếng Việt (Ví dụ: `R` -> Điện trở).
    - Tìm kiếm các sản phẩm tương ứng đang bán trong cửa hàng.
- **Action Suggestions:** AI có thể đề xuất hành động như "Thêm vào giỏ hàng", người dùng chỉ cần xác nhận.

### 2. 📦 Quản lý Đơn hàng & Kho vận (Orders & Inventory)
- **Atomic Stock Management:** Sử dụng MongoDB Sessions & Transactions để đảm bảo tính toàn vẹn dữ liệu tồn kho. Trừ kho ngay khi tạo đơn để tránh overselling.
- **Tự động khôi phục (Rollback):** Nếu đơn hàng bị hủy hoặc giao dịch lỗi, hệ thống tự động hoàn lại số lượng tồn kho.
- **Đồng bộ vận chuyển:** Tự động tạo và cập nhật trạng thái shipment khi đơn hàng thay đổi trạng thái.

### 3. 💳 Thanh toán (Payments)
- **Đa phương thức:** Hỗ trợ thanh toán khi nhận hàng (COD) và VNPay.
- **Quy trình chuẩn:** Xử lý đầy đủ luồng IPN (Instant Payment Notification) từ VNPay để cập nhật trạng thái đơn hàng tự động và an toàn.
- **Transaction History:** Lưu lại lịch sử giao dịch chi tiết để đối soát.

### 4. 🔄 Real-time Updates
- **Socket.IO Gateway:** Server đẩy dữ liệu xuống client ngay lập tức.
- **MongoDB Change Streams:** Hệ thống lắng nghe trực tiếp các thay đổi từ Database (Insert/Update/Delete) để broadcast sự kiện. Ví dụ: Admin cập nhật giá sản phẩm, app người dùng sẽ thấy giá mới ngay lập tức mà không cần refresh.

### 5. 🔔 Notifications & Communication
- **Push Notifications (FCM):** Gửi thông báo đẩy tới thiết bị di động.
- **Email Service (Nodemailer):** Gửi OTP xác thực, thông báo đặt hàng thành công.
- **Targeted Notifications:** Gửi thông báo cho từng cá nhân, theo nhóm quyền (Role) hoặc toàn bộ hệ thống.

---

## 🛠 Công nghệ cốt lõi

### Core Framework
- **NestJS** (v11.x) - Framework Node.js kiến trúc module, sử dụng TypeScript.
- **MongoDB** & **Mongoose** - Database NoSQL linh hoạt, hiệu năng cao.

### Security
- **JWT & Passport**: Authentication an toàn với Access/Refresh tokens.
- **Helmet**: Bảo mật HTTP headers.
- **Rate Limiting**: Chống spam request.

### Integrations
- **Google Gemini API**: Trí tuệ nhân tạo.
- **Cloudinary**: Lưu trữ và tối ưu hình ảnh.
- **VNPay**: Cổng thanh toán.
- **Firebase Admin**: Push notification.

---

## 🚀 Cài đặt và chạy

### Yêu cầu hệ thống
- Node.js >= 18.x
- MongoDB >= 5.x (hoặc MongoDB Atlas)
- npm hoặc yarn

### Cài đặt
- Tạo dự án firebase và tải về serviceAccountKey.json vào thư mục root

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

Tạo file `.env` trong thư mục gốc. Bạn có thể copy từ `.env.example`.

### ⚠️ Lưu ý quan trọng
> Để có file `.env` chuẩn bao gồm các API Key (Gemini, Cloudinary, VNPay) để chạy test dự án ngay lập tức, vui lòng liên hệ:
> - **Zalo:** 0827733475
> - **Email:** levanduy.work@gmail.com

### Các biến chính mẫu:

```bash
# Database
MONGO_URI=mongodb://localhost:27017/electronics_shop

# Security
JWT_SECRET=<your_secret>
REFRESH_SECRET=<your_refresh_secret>

# Third Party
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

GEMINI_API_KEY=...
```

---

## 📁 Cấu trúc dự án

Cấu trúc được tổ chức rõ ràng theo Feature Modules:

```
src/
├── ai/                # Module AI (Gemini Service, Chat Logic)
├── auth/              # Xác thực (Login, Register, OTP)
├── products/          # Quản lý sản phẩm (CRUD, Stock, Change Streams)
├── orders/            # Quản lý đơn hàng & Logic trừ kho
├── payments/          # Tích hợp VNPay & Transaction
├── events/            # WebSocket Gateway (Real-time)
├── upload/            # Upload file (Cloudinary)
├── notifications/     # Push Notification logic
... và các module khác (users, carts, reviews, vouchers...)
```

---

## 📚 API Documentation

API Base URL: `http://localhost:3000`

Hệ thống cung cấp đầy đủ các endpoints cho:
1. **Auth:** Register, Login, Refresh Token, Forgot Password (OTP).
2. **Products:** Tìm kiếm, Lọc, Chi tiết, Đánh giá.
3. **Orders:** Tạo đơn, Lịch sử, Hủy đơn, Tracking.
4. **AI:** Chat bot endpoint, Upload ảnh phân tích mạch.
5. **Admin Resources:** CRUD đầy đủ cho Users, Vouchers, Banners.

(Xem chi tiết payload và response trong code hoặc sử dụng Postman Collection đi kèm nếu có).

---

## 📞 Liên hệ

Mọi thắc mắc về cài đặt, vận hành hoặc yêu cầu tài liệu chi tiết hơn, xin vui lòng liên hệ:

- **Tác giả:** Le Van Duy
- **Zalo:** 0827733475
- **Email:** levanduy.work@gmail.com

---
*© 2026 Electronics Backend Project*
