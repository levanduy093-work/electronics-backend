# ElectronicsShop Backend

API server for ElectronicsShop. Provides product, cart, order, review, voucher, AI chat history, and admin endpoints.

## Tech Stack
- Node.js + NestJS
- MongoDB + Mongoose
- JWT Auth

## Requirements
- Node.js >= 20
- MongoDB (local or managed)

## Environment
Create `.env` in this folder:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/electronics_shop
JWT_SECRET=your_secret
JWT_EXPIRES=7d
REFRESH_TOKEN_SECRET=your_refresh_secret
REFRESH_TOKEN_EXPIRES=30d
```

## Install
```bash
npm install
```

## Run
```bash
# dev
npm run start:dev

# build
npm run build

# prod
npm run start:prod
```

## Deploy (Reference)
1. Build server:
```bash
npm install
npm run build
```
2. Run (example with node):
```bash
NODE_ENV=production node dist/main.js
```
3. Configure reverse proxy (Nginx) to expose `PORT` and enable HTTPS.
4. Set environment variables in your host (or `.env`).

## API Contract
Base URL: `https://<backend-host>`

Auth:
- Bearer token in `Authorization: Bearer <token>`

Core endpoints (sample):
- `POST /auth/login`
- `POST /auth/social-login`
- `POST /auth/register/send-otp`
- `POST /auth/register/verify-otp`
- `POST /auth/password/reset/send-otp`
- `POST /auth/password/reset/verify-otp`
- `GET /products`
- `GET /products/:id`
- `GET /reviews/product/:productId`
- `POST /reviews`
- `GET /orders/my`
- `POST /orders`
- `GET /notifications/my`

## Postman Collection
Path:
- `/Users/levanduy/Nam4/HK2/Mobile/ElectroAI/docs/postman/ElectronicsShop.postman_collection.json`

Usage:
1. Open Postman → Import → select the file.
2. Set the `base_url` variable to your API URL.
3. Set `access_token` after login.
4. Fill ids (`product_id`, `order_id`, ...) as needed.

## Key Modules
- `src/auth`
- `src/products`
- `src/carts`
- `src/orders`
- `src/reviews`
- `src/vouchers`
- `src/notifications`
- `src/ai-chat` (chat history + archives)

## Data Model (Core)
- Users
- Products
- Orders
- Reviews
- Vouchers

## Notes
- Reviews: create endpoint upserts by `(userId, productId)`.
- AI chat history supports both local persistence (mobile) and remote sync.

## Troubleshooting
- Ensure MongoDB connection string is correct.
- If authentication fails, verify JWT secrets.
