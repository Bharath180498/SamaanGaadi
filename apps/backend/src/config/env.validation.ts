import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

class EnvSchema {
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  PORT?: number;

  @IsOptional()
  @IsString()
  AUTH_MODE?: string;

  @IsOptional()
  @IsString()
  OTP_PROVIDER?: string;

  @IsOptional()
  @IsString()
  ROUTE_PROVIDER?: string;

  @IsOptional()
  @IsString()
  KYC_PROVIDER?: string;

  @IsOptional()
  @IsString()
  PUSH_PROVIDER?: string;

  @IsOptional()
  @IsString()
  GOOGLE_MAPS_API_KEY?: string;

  @IsOptional()
  @IsString()
  IDFY_API_KEY?: string;

  @IsOptional()
  @IsString()
  IDFY_API_URL?: string;

  @IsOptional()
  @IsString()
  IDFY_ACCOUNT_ID?: string;

  @IsOptional()
  @IsString()
  CASHFREE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  CASHFREE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  CASHFREE_KYC_API_URL?: string;

  @IsOptional()
  @IsString()
  CASHFREE_API_VERSION?: string;

  @IsOptional()
  @IsString()
  CASHFREE_PAYMENTS_API_URL?: string;

  @IsOptional()
  @IsString()
  CASHFREE_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  CASHFREE_PAYMENT_RETURN_URL?: string;

  @IsOptional()
  @IsString()
  SUREPASS_API_URL?: string;

  @IsOptional()
  @IsString()
  SUREPASS_API_KEY?: string;

  @IsOptional()
  @IsString()
  SUREPASS_API_KEY_HEADER?: string;

  @IsOptional()
  @IsString()
  SUREPASS_STATIC_BEARER_TOKEN?: string;

  @IsOptional()
  @IsString()
  SUREPASS_DRIVING_LICENSE_PATH?: string;

  @IsOptional()
  @IsString()
  SUREPASS_RC_PATH?: string;

  @IsOptional()
  @IsString()
  SUREPASS_RC_CHALLAN_PATH?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  KYC_CACHE_VERIFIED_HOURS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  KYC_CACHE_NON_VERIFIED_HOURS?: number;

  @IsOptional()
  @IsString()
  FCM_SERVER_KEY?: string;

  @IsOptional()
  @IsString()
  OTP_FIXED_CODE?: string;

  @IsOptional()
  @IsString()
  ADMIN_PASSCODE?: string;

  @IsOptional()
  @IsString()
  SUPPORT_PHONE?: string;

  @IsOptional()
  @IsString()
  SUPPORT_TRANSLATION_ENABLED?: string;

  @IsOptional()
  @IsString()
  SUPPORT_TRANSLATION_TARGET_LANGUAGE?: string;

  @IsOptional()
  @IsString()
  GOOGLE_TRANSLATE_API_KEY?: string;

  @IsOptional()
  @IsString()
  GOOGLE_TRANSLATE_API_URL?: string;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  QARGO_AI_ENABLED?: string;

  @IsOptional()
  @IsString()
  QARGO_AI_MODEL_DEFAULT?: string;

  @IsOptional()
  @IsString()
  QARGO_AI_MODEL_COMPLEX?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  QARGO_AI_MAX_TOOL_CALLS_PER_RUN?: number;

  @IsOptional()
  @IsInt()
  @Min(256)
  QARGO_AI_MAX_TOKENS_PER_RUN?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  QARGO_AI_MAX_RUNS_PER_MINUTE?: number;

  @IsOptional()
  @IsInt()
  @Min(60)
  OTP_TTL_SECONDS?: number;

  @IsOptional()
  @IsString()
  TWILIO_ACCOUNT_SID?: string;

  @IsOptional()
  @IsString()
  TWILIO_AUTH_TOKEN?: string;

  @IsOptional()
  @IsString()
  TWILIO_MESSAGING_SERVICE_SID?: string;

  @IsOptional()
  @IsString()
  TWILIO_FROM_NUMBER?: string;

  @IsOptional()
  @IsString()
  RAZORPAY_KEY_ID?: string;

  @IsOptional()
  @IsString()
  RAZORPAY_KEY_SECRET?: string;

  @IsOptional()
  @IsString()
  RAZORPAY_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  UPI_PAYEE_VPA?: string;

  @IsOptional()
  @IsString()
  UPI_PAYEE_NAME?: string;

  @IsOptional()
  @IsString()
  EWAY_BILL_API_KEY?: string;

  @IsOptional()
  @IsString()
  EWAY_BILL_API_URL?: string;

  @IsOptional()
  @IsString()
  INSURANCE_API_URL?: string;

  @IsOptional()
  @IsString()
  INSURANCE_API_KEY?: string;

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_REGION?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_ACCESS_KEY?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvSchema, config, { enableImplicitConversion: true });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return config;
}
