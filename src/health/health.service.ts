import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getStatus() {
    return {
      status: 'ok',
      service: 'electronics-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
