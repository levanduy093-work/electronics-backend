import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private initialized = false;

  onModuleInit() {
    try {
      // Look for serviceAccountKey.json in root or config folder
      const keyPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
      
      if (fs.existsSync(keyPath)) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const serviceAccount = require(keyPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.initialized = true;
        this.logger.log('Firebase Admin SDK initialized successfully');
      } else {
        this.logger.warn('serviceAccountKey.json not found. Push notifications will be disabled.');
      }
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error);
    }
  }

  async sendToDevice(tokens: string[], title: string, body: string, data?: Record<string, string>) {
    if (!this.initialized || !tokens.length) return;

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body,
        },
        data: data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      if (response.failureCount > 0) {
        this.logger.warn(`Failed to send ${response.failureCount} messages`);
        // Cleanup invalid tokens could happen here
      }
      return response;
    } catch (error) {
      this.logger.error('Error sending FCM message', error);
    }
  }
}
