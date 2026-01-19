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
      const serviceAccount = this.loadServiceAccountKey();
      if (!serviceAccount) {
        this.logger.warn(
          'serviceAccountKey.json not found (checked CWD and dist-root). Push notifications will be disabled.',
        );
        return;
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
      this.initialized = true;
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error);
    }
  }

  /**
   * Locate the service account key in common locations so prod build (dist) still works.
   */
  private loadServiceAccountKey(): admin.ServiceAccount | null {
    const candidates = [
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
      path.resolve(process.cwd(), 'serviceAccountKey.json'),
      path.resolve(__dirname, '../../serviceAccountKey.json'),
      path.resolve(__dirname, '../../../serviceAccountKey.json'),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          this.logger.log(`Using Firebase service account from: ${candidate}`);
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          return require(candidate);
        }
      } catch (err) {
        this.logger.warn(`Failed to read Firebase key at ${candidate}: ${err}`);
      }
    }
    return null;
  }

  async sendToDevice(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    if (!this.initialized || !tokens.length) return;

    try {
      const dataPayload: Record<string, string> = {};
      Object.entries(data || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        dataPayload[key] = String(value);
      });

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body,
        },
        data: dataPayload,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'high-priority',
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
        const failedTokens: string[] = [];
        const errorCounts: Record<string, number> = {};
        
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(tokens[idx]);
            const errorCode = resp.error?.code || 'unknown';
            const errorMessage = resp.error?.message || 'Unknown error';
            errorCounts[errorCode] = (errorCounts[errorCode] || 0) + 1;
            
            // Only log first few failures to avoid log spam
            if (failedTokens.length <= 3) {
              this.logger.debug(
                `Failed to send to token ${tokens[idx].substring(0, 20)}...: ${errorMessage}`,
              );
            }
          }
        });
        
        // Summarize errors
        const errorSummary = Object.entries(errorCounts)
          .map(([code, count]) => `${code} (${count}x)`)
          .join(', ');
        
        this.logger.warn(
          `Failed to send ${response.failureCount} out of ${tokens.length} messages. Errors: ${errorSummary}. ${failedTokens.length === tokens.length ? 'All tokens appear to be invalid. This is normal if using test/placeholder tokens.' : 'Some tokens may be invalid and should be cleaned up from user database.'}`,
        );
        
        // Note: Invalid tokens should be cleaned up from user database
        // Common error codes indicating invalid tokens:
        // - 'messaging/invalid-registration-token'
        // - 'messaging/registration-token-not-registered' 
        // - 'messaging/invalid-argument' (when token doesn't exist in Firebase)
      } else {
        this.logger.log(`Successfully sent ${response.successCount} messages`);
      }
      return response;
    } catch (error) {
      this.logger.error('Error sending FCM message', error);
    }
  }
}
