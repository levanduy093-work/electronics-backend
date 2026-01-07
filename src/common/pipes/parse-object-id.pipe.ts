import { BadRequestException, PipeTransform } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidObjectId(value)) {
      throw new BadRequestException('Invalid ObjectId');
    }
    return value;
  }
}
