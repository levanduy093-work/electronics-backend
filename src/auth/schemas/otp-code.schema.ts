import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'otp_codes', timestamps: true })
export class OtpCode {
  @Prop({ required: true, lowercase: true, index: true })
  email: string;

  @Prop({ required: true })
  purpose: string;

  @Prop({ required: true })
  codeHashed: string;

  @Prop({ required: true, expires: 0 })
  expiresAt: Date;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: false })
  used: boolean;
}

export type OtpCodeDocument = HydratedDocument<OtpCode>;
export const OtpCodeSchema = SchemaFactory.createForClass(OtpCode);
