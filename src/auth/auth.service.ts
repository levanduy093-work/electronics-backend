import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  // Placeholder for authentication logic (JWT/local/OAuth).
  validate() {
    return { status: 'stub', feature: 'auth' };
  }
}
