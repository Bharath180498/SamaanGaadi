export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  authMode: process.env.AUTH_MODE ?? 'mock',
  otpProvider: process.env.OTP_PROVIDER ?? 'mock',
  routeProvider: process.env.ROUTE_PROVIDER ?? 'mock',
  kycProvider: process.env.KYC_PROVIDER ?? 'mock',
  pushProvider: process.env.PUSH_PROVIDER ?? 'mock',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'super-secret-jwt-key',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d'
  },
  otp: {
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
    fixedCode: process.env.OTP_FIXED_CODE ?? '123456'
  },
  adminPasscode: process.env.ADMIN_PASSCODE ?? '',
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID ?? '',
    fromNumber: process.env.TWILIO_FROM_NUMBER ?? ''
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  dispatchRadiusKm: Number(process.env.DISPATCH_RADIUS_KM ?? 8),
  waitingRatePerMinute: Number(process.env.WAITING_RATE_PER_MINUTE ?? 3),
  baseFarePerKm: Number(process.env.BASE_FARE_PER_KM ?? 14),
  alwaysOnDiscountPercent: Number(process.env.ALWAYS_ON_DISCOUNT_PERCENT ?? 8),
  supportPhone: process.env.SUPPORT_PHONE ?? '9844259899',
  supportTranslation: {
    enabled: process.env.SUPPORT_TRANSLATION_ENABLED === 'true',
    targetLanguage: process.env.SUPPORT_TRANSLATION_TARGET_LANGUAGE ?? 'en',
    googleApiKey: process.env.GOOGLE_TRANSLATE_API_KEY ?? '',
    googleApiUrl:
      process.env.GOOGLE_TRANSLATE_API_URL ?? 'https://translation.googleapis.com/language/translate/v2'
  },
  qargoAi: {
    enabled: process.env.QARGO_AI_ENABLED === 'true',
    openAiApiKey: process.env.OPENAI_API_KEY ?? '',
    modelDefault: process.env.QARGO_AI_MODEL_DEFAULT ?? 'gpt-4o-mini',
    modelComplex: process.env.QARGO_AI_MODEL_COMPLEX ?? 'gpt-4.1',
    maxToolCallsPerRun: Number(process.env.QARGO_AI_MAX_TOOL_CALLS_PER_RUN ?? 8),
    maxTokensPerRun: Number(process.env.QARGO_AI_MAX_TOKENS_PER_RUN ?? 4000),
    maxRunsPerMinute: Number(process.env.QARGO_AI_MAX_RUNS_PER_MINUTE ?? 12)
  },
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
  idfyApiKey: process.env.IDFY_API_KEY ?? '',
  idfyApiUrl: process.env.IDFY_API_URL ?? '',
  idfyAccountId: process.env.IDFY_ACCOUNT_ID ?? '',
  cashfree: {
    clientId: process.env.CASHFREE_CLIENT_ID ?? '',
    clientSecret: process.env.CASHFREE_CLIENT_SECRET ?? '',
    kycApiUrl: process.env.CASHFREE_KYC_API_URL ?? '',
    apiVersion: process.env.CASHFREE_API_VERSION ?? '2023-08-01',
    paymentsApiUrl: process.env.CASHFREE_PAYMENTS_API_URL ?? 'https://api.cashfree.com/pg/orders',
    webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET ?? '',
    paymentReturnUrl: process.env.CASHFREE_PAYMENT_RETURN_URL ?? ''
  },
  surepass: {
    apiUrl: process.env.SUREPASS_API_URL ?? 'https://kyc-api.surepass.io',
    apiKey: process.env.SUREPASS_API_KEY ?? '',
    apiKeyHeader: process.env.SUREPASS_API_KEY_HEADER ?? 'x-api-key',
    staticBearerToken: process.env.SUREPASS_STATIC_BEARER_TOKEN ?? '',
    drivingLicensePath: process.env.SUREPASS_DRIVING_LICENSE_PATH ?? '/api/v1/driving-license/driving-license',
    rcPath: process.env.SUREPASS_RC_PATH ?? '/api/v1/rc/rc-v2',
    rcChallanPath: process.env.SUREPASS_RC_CHALLAN_PATH ?? ''
  },
  kycCache: {
    verifiedHours: Number(process.env.KYC_CACHE_VERIFIED_HOURS ?? 2160),
    nonVerifiedHours: Number(process.env.KYC_CACHE_NON_VERIFIED_HOURS ?? 24)
  },
  fcmServerKey: process.env.FCM_SERVER_KEY ?? '',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? ''
  },
  upi: {
    payeeVpa: process.env.UPI_PAYEE_VPA ?? '',
    payeeName: process.env.UPI_PAYEE_NAME ?? 'Qargo Logistics'
  },
  ewayBillApiUrl: process.env.EWAY_BILL_API_URL ?? '',
  ewayBillApiKey: process.env.EWAY_BILL_API_KEY ?? '',
  insuranceApiUrl: process.env.INSURANCE_API_URL ?? '',
  insuranceApiKey: process.env.INSURANCE_API_KEY ?? '',
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? '',
    region: process.env.S3_REGION ?? '',
    bucket: process.env.S3_BUCKET ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? ''
  }
});
