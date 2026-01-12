import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { CartsModule } from './carts/carts.module';
import { ChatModule } from './chat/chat.module';
import { EventsModule } from './events/events.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthModule } from './health/health.module';
import { InventoryMovementsModule } from './inventory-movements/inventory-movements.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { UploadModule } from './upload/upload.module';
import { BannersModule } from './banners/banners.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        // Hỗ trợ cả mongodb và mongodb+srv (Atlas)
        MONGO_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),
        JWT_SECRET: Joi.string().min(32).required(),
        REFRESH_SECRET: Joi.string().min(32).required(),
        PORT: Joi.number().default(3000),
        CORS_ORIGINS: Joi.string().optional(),
        SMTP_HOST: Joi.string().required(),
        SMTP_PORT: Joi.number().required(),
        SMTP_USER: Joi.string().required(),
        SMTP_PASS: Joi.string().required(),
        SMTP_FROM: Joi.string().required(),
        SMTP_SECURE: Joi.string().valid('true', 'false').optional(),
        OTP_TTL_SECONDS: Joi.number().default(600),
        OTP_MAX_ATTEMPTS: Joi.number().default(5),
        VNP_TMN_CODE: Joi.string().optional(),
        VNP_HASH_SECRET: Joi.string().optional(),
        VNP_URL: Joi.string().uri().optional(),
        VNP_RETURN_URL: Joi.string().uri().optional(),
        VNP_IPN_URL: Joi.string().uri().optional(),
        CLOUDINARY_CLOUD_NAME: Joi.string().required(),
        CLOUDINARY_API_KEY: Joi.string().required(),
        CLOUDINARY_API_SECRET: Joi.string().required(),
      }),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGO_URI');
        if (!uri) {
          throw new Error('MONGO_URI must be provided');
        }
        return { uri };
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    CartsModule,
    VouchersModule,
    NotificationsModule,
    ReviewsModule,
    TransactionsModule,
    PaymentsModule,
    ShipmentsModule,
    InventoryMovementsModule,
    ChatModule,
    AiModule,
    HealthModule,
    EventsModule,
    UploadModule,
    BannersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
