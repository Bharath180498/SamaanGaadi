#!/usr/bin/env bash
set -euo pipefail

BACKEND_SERVICE="backend"
ADMIN_SERVICE="admin"
POSTGRES_SERVICE="Postgres"
REDIS_SERVICE="Redis"
JWT_SECRET_INPUT="${JWT_SECRET:-}"
GOOGLE_MAPS_API_KEY_INPUT="${GOOGLE_MAPS_API_KEY:-}"
ROUTE_PROVIDER_VALUE="${ROUTE_PROVIDER:-mock}"
KYC_PROVIDER_VALUE="${KYC_PROVIDER:-mock}"
PUSH_PROVIDER_VALUE="${PUSH_PROVIDER:-mock}"
OTP_PROVIDER_VALUE="${OTP_PROVIDER:-mock}"
IDFY_API_KEY_INPUT="${IDFY_API_KEY:-}"
IDFY_API_URL_INPUT="${IDFY_API_URL:-https://api.idfy.com/v3/tasks}"
IDFY_ACCOUNT_ID_INPUT="${IDFY_ACCOUNT_ID:-}"
CASHFREE_CLIENT_ID_INPUT="${CASHFREE_CLIENT_ID:-}"
CASHFREE_CLIENT_SECRET_INPUT="${CASHFREE_CLIENT_SECRET:-}"
CASHFREE_KYC_API_URL_INPUT="${CASHFREE_KYC_API_URL:-https://api.cashfree.com/verification}"
CASHFREE_API_VERSION_INPUT="${CASHFREE_API_VERSION:-2023-08-01}"
CASHFREE_PAYMENTS_API_URL_INPUT="${CASHFREE_PAYMENTS_API_URL:-https://api.cashfree.com/pg/orders}"
CASHFREE_WEBHOOK_SECRET_INPUT="${CASHFREE_WEBHOOK_SECRET:-}"
CASHFREE_PAYMENT_RETURN_URL_INPUT="${CASHFREE_PAYMENT_RETURN_URL:-}"
SUREPASS_API_URL_INPUT="${SUREPASS_API_URL:-https://kyc-api.surepass.io}"
SUREPASS_API_KEY_INPUT="${SUREPASS_API_KEY:-}"
SUREPASS_API_KEY_HEADER_INPUT="${SUREPASS_API_KEY_HEADER:-x-api-key}"
SUREPASS_STATIC_BEARER_TOKEN_INPUT="${SUREPASS_STATIC_BEARER_TOKEN:-}"
SUREPASS_DRIVING_LICENSE_PATH_INPUT="${SUREPASS_DRIVING_LICENSE_PATH:-/api/v1/driving-license/driving-license}"
SUREPASS_RC_PATH_INPUT="${SUREPASS_RC_PATH:-/api/v1/rc/rc-v2}"
SUREPASS_RC_CHALLAN_PATH_INPUT="${SUREPASS_RC_CHALLAN_PATH:-}"
FCM_SERVER_KEY_INPUT="${FCM_SERVER_KEY:-}"
TWILIO_ACCOUNT_SID_INPUT="${TWILIO_ACCOUNT_SID:-}"
TWILIO_AUTH_TOKEN_INPUT="${TWILIO_AUTH_TOKEN:-}"
TWILIO_MESSAGING_SERVICE_SID_INPUT="${TWILIO_MESSAGING_SERVICE_SID:-}"
TWILIO_FROM_NUMBER_INPUT="${TWILIO_FROM_NUMBER:-}"
RAZORPAY_KEY_ID_INPUT="${RAZORPAY_KEY_ID:-}"
RAZORPAY_KEY_SECRET_INPUT="${RAZORPAY_KEY_SECRET:-}"
RAZORPAY_WEBHOOK_SECRET_INPUT="${RAZORPAY_WEBHOOK_SECRET:-}"
UPI_PAYEE_VPA_INPUT="${UPI_PAYEE_VPA:-}"
UPI_PAYEE_NAME_INPUT="${UPI_PAYEE_NAME:-Qargo Logistics}"
EWAY_BILL_API_KEY_INPUT="${EWAY_BILL_API_KEY:-}"
INSURANCE_API_URL_INPUT="${INSURANCE_API_URL:-}"
INSURANCE_API_KEY_INPUT="${INSURANCE_API_KEY:-}"
ADMIN_PASSCODE_INPUT="${ADMIN_PASSCODE:-change-me-admin-passcode}"
SUPPORT_PHONE_INPUT="${SUPPORT_PHONE:-9844259899}"
SUPPORT_TRANSLATION_ENABLED_INPUT="${SUPPORT_TRANSLATION_ENABLED:-false}"
SUPPORT_TRANSLATION_TARGET_LANGUAGE_INPUT="${SUPPORT_TRANSLATION_TARGET_LANGUAGE:-en}"
GOOGLE_TRANSLATE_API_KEY_INPUT="${GOOGLE_TRANSLATE_API_KEY:-}"
GOOGLE_TRANSLATE_API_URL_INPUT="${GOOGLE_TRANSLATE_API_URL:-https://translation.googleapis.com/language/translate/v2}"
QARGO_AI_ENABLED_INPUT="${QARGO_AI_ENABLED:-false}"
OPENAI_API_KEY_INPUT="${OPENAI_API_KEY:-}"
QARGO_AI_MODEL_DEFAULT_INPUT="${QARGO_AI_MODEL_DEFAULT:-gpt-4o-mini}"
QARGO_AI_MODEL_COMPLEX_INPUT="${QARGO_AI_MODEL_COMPLEX:-gpt-4.1}"
QARGO_AI_MAX_TOOL_CALLS_PER_RUN_INPUT="${QARGO_AI_MAX_TOOL_CALLS_PER_RUN:-8}"
QARGO_AI_MAX_TOKENS_PER_RUN_INPUT="${QARGO_AI_MAX_TOKENS_PER_RUN:-4000}"
QARGO_AI_MAX_RUNS_PER_MINUTE_INPUT="${QARGO_AI_MAX_RUNS_PER_MINUTE:-12}"
S3_ENDPOINT_INPUT="${S3_ENDPOINT:-}"
S3_REGION_INPUT="${S3_REGION:-ap-south-1}"
S3_BUCKET_INPUT="${S3_BUCKET:-}"
S3_ACCESS_KEY_ID_INPUT="${S3_ACCESS_KEY_ID:-}"
S3_SECRET_ACCESS_KEY_INPUT="${S3_SECRET_ACCESS_KEY:-}"
SKIP_ADMIN="false"

usage() {
  cat <<'EOF'
Configure Railway service variables for this monorepo.

Usage:
  ./infra/railway/scripts/configure_vars.sh \
    [--backend-service backend] \
    [--admin-service admin] \
    [--postgres-service Postgres] \
    [--redis-service Redis] \
    [--route-provider mock|google] \
    [--kyc-provider mock|idfy|cashfree|surepass] \
    [--push-provider mock|expo|fcm] \
    [--otp-provider mock|twilio] \
    [--google-maps-api-key your-key] \
    [--idfy-api-key your-key] \
    [--idfy-api-url https://api.idfy.com/v3/tasks] \
    [--idfy-account-id your-account-id] \
    [--cashfree-client-id your-client-id] \
    [--cashfree-client-secret your-client-secret] \
    [--cashfree-kyc-api-url https://api.cashfree.com/verification] \
    [--cashfree-api-version 2023-08-01] \
    [--cashfree-payments-api-url https://api.cashfree.com/pg/orders] \
    [--cashfree-webhook-secret your-webhook-secret] \
    [--cashfree-payment-return-url https://your-app.example/payment-return] \
    [--surepass-api-url https://kyc-api.surepass.io] \
    [--surepass-api-key your-key] \
    [--surepass-api-key-header x-api-key] \
    [--surepass-static-bearer-token your-token] \
    [--surepass-driving-license-path /api/v1/driving-license/driving-license] \
    [--surepass-rc-path /api/v1/rc/rc-v2] \
    [--surepass-rc-challan-path /api/v1/vehicle-rc-challan-advanced] \
    [--fcm-server-key your-key] \
    [--twilio-account-sid ACxxxx] \
    [--twilio-auth-token xxxx] \
    [--twilio-messaging-service-sid MGxxxx] \
    [--twilio-from-number +1xxxx] \
    [--razorpay-key-id rzp_test_xxxx] \
    [--razorpay-key-secret xxxx] \
    [--razorpay-webhook-secret xxxx] \
    [--upi-payee-vpa merchant@upi] \
    [--upi-payee-name "Qargo Logistics"] \
    [--eway-bill-api-key your-key] \
    [--insurance-api-url https://insurance.example] \
    [--insurance-api-key your-key] \
    [--admin-passcode launch-admin-passcode] \
    [--support-phone 9844259899] \
    [--support-translation-enabled true|false] \
    [--support-translation-target-language en] \
    [--google-translate-api-key your-key] \
    [--google-translate-api-url https://translation.googleapis.com/language/translate/v2] \
    [--qargo-ai-enabled true|false] \
    [--openai-api-key your-openai-key] \
    [--qargo-ai-model-default gpt-4o-mini] \
    [--qargo-ai-model-complex gpt-4.1] \
    [--qargo-ai-max-tool-calls-per-run 8] \
    [--qargo-ai-max-tokens-per-run 4000] \
    [--qargo-ai-max-runs-per-minute 12] \
    [--s3-endpoint https://s3.ap-south-1.amazonaws.com] \
    [--s3-region ap-south-1] \
    [--s3-bucket qargo-prod-assets] \
    [--s3-access-key-id AKIA...] \
    [--s3-secret-access-key ...] \
    [--skip-admin] \
    [--jwt-secret your-secret]

Notes:
  - Run after creating all Railway services.
  - This script uses Railway service references:
    DATABASE_URL=${{Postgres.DATABASE_URL}}
    REDIS_URL=${{Redis.REDIS_URL}}
    NEXT_PUBLIC_API_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}/api
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    date +%s | shasum | awk '{print $1}'
  fi
}

is_placeholder() {
  local value="${1:-}"
  local lowered
  lowered="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$lowered" in
    ""|replace-me|changeme|change-me|change-me-admin-passcode|your-key|your-secret|xxxx)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

validate_choice() {
  local key="$1"
  local value="$2"
  shift 2
  for option in "$@"; do
    if [[ "$value" == "$option" ]]; then
      return 0
    fi
  done
  echo "Invalid value for $key: '$value'. Allowed: $*" >&2
  exit 1
}

require_real_value() {
  local key="$1"
  local value="$2"
  if is_placeholder "$value"; then
    echo "$key is required and cannot be empty or placeholder when this provider is enabled." >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-service)
      BACKEND_SERVICE="$2"
      shift 2
      ;;
    --admin-service)
      ADMIN_SERVICE="$2"
      shift 2
      ;;
    --postgres-service)
      POSTGRES_SERVICE="$2"
      shift 2
      ;;
    --redis-service)
      REDIS_SERVICE="$2"
      shift 2
      ;;
    --jwt-secret)
      JWT_SECRET_INPUT="$2"
      shift 2
      ;;
    --skip-admin)
      SKIP_ADMIN="true"
      shift
      ;;
    --route-provider)
      ROUTE_PROVIDER_VALUE="$2"
      shift 2
      ;;
    --kyc-provider)
      KYC_PROVIDER_VALUE="$2"
      shift 2
      ;;
    --push-provider)
      PUSH_PROVIDER_VALUE="$2"
      shift 2
      ;;
    --otp-provider)
      OTP_PROVIDER_VALUE="$2"
      shift 2
      ;;
    --google-maps-api-key)
      GOOGLE_MAPS_API_KEY_INPUT="$2"
      shift 2
      ;;
    --idfy-api-key)
      IDFY_API_KEY_INPUT="$2"
      shift 2
      ;;
    --idfy-api-url)
      IDFY_API_URL_INPUT="$2"
      shift 2
      ;;
    --idfy-account-id)
      IDFY_ACCOUNT_ID_INPUT="$2"
      shift 2
      ;;
    --cashfree-client-id)
      CASHFREE_CLIENT_ID_INPUT="$2"
      shift 2
      ;;
    --cashfree-client-secret)
      CASHFREE_CLIENT_SECRET_INPUT="$2"
      shift 2
      ;;
    --cashfree-kyc-api-url)
      CASHFREE_KYC_API_URL_INPUT="$2"
      shift 2
      ;;
    --cashfree-api-version)
      CASHFREE_API_VERSION_INPUT="$2"
      shift 2
      ;;
    --cashfree-payments-api-url)
      CASHFREE_PAYMENTS_API_URL_INPUT="$2"
      shift 2
      ;;
    --cashfree-webhook-secret)
      CASHFREE_WEBHOOK_SECRET_INPUT="$2"
      shift 2
      ;;
    --cashfree-payment-return-url)
      CASHFREE_PAYMENT_RETURN_URL_INPUT="$2"
      shift 2
      ;;
    --surepass-api-url)
      SUREPASS_API_URL_INPUT="$2"
      shift 2
      ;;
    --surepass-api-key)
      SUREPASS_API_KEY_INPUT="$2"
      shift 2
      ;;
    --surepass-api-key-header)
      SUREPASS_API_KEY_HEADER_INPUT="$2"
      shift 2
      ;;
    --surepass-static-bearer-token)
      SUREPASS_STATIC_BEARER_TOKEN_INPUT="$2"
      shift 2
      ;;
    --surepass-driving-license-path)
      SUREPASS_DRIVING_LICENSE_PATH_INPUT="$2"
      shift 2
      ;;
    --surepass-rc-path)
      SUREPASS_RC_PATH_INPUT="$2"
      shift 2
      ;;
    --surepass-rc-challan-path)
      SUREPASS_RC_CHALLAN_PATH_INPUT="$2"
      shift 2
      ;;
    --fcm-server-key)
      FCM_SERVER_KEY_INPUT="$2"
      shift 2
      ;;
    --twilio-account-sid)
      TWILIO_ACCOUNT_SID_INPUT="$2"
      shift 2
      ;;
    --twilio-auth-token)
      TWILIO_AUTH_TOKEN_INPUT="$2"
      shift 2
      ;;
    --twilio-messaging-service-sid)
      TWILIO_MESSAGING_SERVICE_SID_INPUT="$2"
      shift 2
      ;;
    --twilio-from-number)
      TWILIO_FROM_NUMBER_INPUT="$2"
      shift 2
      ;;
    --razorpay-key-id)
      RAZORPAY_KEY_ID_INPUT="$2"
      shift 2
      ;;
    --razorpay-key-secret)
      RAZORPAY_KEY_SECRET_INPUT="$2"
      shift 2
      ;;
    --razorpay-webhook-secret)
      RAZORPAY_WEBHOOK_SECRET_INPUT="$2"
      shift 2
      ;;
    --upi-payee-vpa)
      UPI_PAYEE_VPA_INPUT="$2"
      shift 2
      ;;
    --upi-payee-name)
      UPI_PAYEE_NAME_INPUT="$2"
      shift 2
      ;;
    --eway-bill-api-key)
      EWAY_BILL_API_KEY_INPUT="$2"
      shift 2
      ;;
    --insurance-api-url)
      INSURANCE_API_URL_INPUT="$2"
      shift 2
      ;;
    --insurance-api-key)
      INSURANCE_API_KEY_INPUT="$2"
      shift 2
      ;;
    --admin-passcode)
      ADMIN_PASSCODE_INPUT="$2"
      shift 2
      ;;
    --support-phone)
      SUPPORT_PHONE_INPUT="$2"
      shift 2
      ;;
    --support-translation-enabled)
      SUPPORT_TRANSLATION_ENABLED_INPUT="$2"
      shift 2
      ;;
    --support-translation-target-language)
      SUPPORT_TRANSLATION_TARGET_LANGUAGE_INPUT="$2"
      shift 2
      ;;
    --google-translate-api-key)
      GOOGLE_TRANSLATE_API_KEY_INPUT="$2"
      shift 2
      ;;
    --google-translate-api-url)
      GOOGLE_TRANSLATE_API_URL_INPUT="$2"
      shift 2
      ;;
    --qargo-ai-enabled)
      QARGO_AI_ENABLED_INPUT="$2"
      shift 2
      ;;
    --openai-api-key)
      OPENAI_API_KEY_INPUT="$2"
      shift 2
      ;;
    --qargo-ai-model-default)
      QARGO_AI_MODEL_DEFAULT_INPUT="$2"
      shift 2
      ;;
    --qargo-ai-model-complex)
      QARGO_AI_MODEL_COMPLEX_INPUT="$2"
      shift 2
      ;;
    --qargo-ai-max-tool-calls-per-run)
      QARGO_AI_MAX_TOOL_CALLS_PER_RUN_INPUT="$2"
      shift 2
      ;;
    --qargo-ai-max-tokens-per-run)
      QARGO_AI_MAX_TOKENS_PER_RUN_INPUT="$2"
      shift 2
      ;;
    --qargo-ai-max-runs-per-minute)
      QARGO_AI_MAX_RUNS_PER_MINUTE_INPUT="$2"
      shift 2
      ;;
    --s3-endpoint)
      S3_ENDPOINT_INPUT="$2"
      shift 2
      ;;
    --s3-region)
      S3_REGION_INPUT="$2"
      shift 2
      ;;
    --s3-bucket)
      S3_BUCKET_INPUT="$2"
      shift 2
      ;;
    --s3-access-key-id)
      S3_ACCESS_KEY_ID_INPUT="$2"
      shift 2
      ;;
    --s3-secret-access-key)
      S3_SECRET_ACCESS_KEY_INPUT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd railway

if ! railway status >/dev/null 2>&1; then
  echo "Railway project is not linked. Run: railway link" >&2
  exit 1
fi

if [[ -z "$JWT_SECRET_INPUT" ]]; then
  JWT_SECRET_INPUT="$(generate_secret)"
  echo "Generated JWT secret."
fi

set_var() {
  local service="$1"
  local assignment="$2"
  local max_attempts="${RAILWAY_MAX_RETRIES:-4}"
  local delay_seconds="${RAILWAY_RETRY_DELAY_SECONDS:-3}"
  local attempt=1

  while (( attempt <= max_attempts )); do
    if railway variable set "$assignment" --service "$service" --skip-deploys >/dev/null; then
      return 0
    fi

    if (( attempt < max_attempts )); then
      echo "Retrying Railway variable set (attempt $attempt/$max_attempts failed). Waiting ${delay_seconds}s..." >&2
      sleep "$delay_seconds"
    fi
    attempt=$((attempt + 1))
  done

  echo
  echo "Failed to set variable on service '$service' after $max_attempts attempts." >&2
  echo "Check connectivity and service names:" >&2
  echo "  railway status" >&2
  echo "  railway service status --all" >&2
  echo "Then rerun with explicit names, e.g.:" >&2
  echo "  npm run railway:configure-vars -- --backend-service <name> --postgres-service <name> --redis-service <name>" >&2
  exit 1
}

set_var_if_real() {
  local service="$1"
  local key="$2"
  local value="$3"
  if is_placeholder "$value"; then
    echo "Skipping $key (empty or placeholder)."
    return 0
  fi
  set_var "$service" "$key=$value"
}

validate_choice "ROUTE_PROVIDER" "$ROUTE_PROVIDER_VALUE" "mock" "google"
validate_choice "KYC_PROVIDER" "$KYC_PROVIDER_VALUE" "mock" "idfy" "cashfree" "surepass"
validate_choice "PUSH_PROVIDER" "$PUSH_PROVIDER_VALUE" "mock" "expo" "fcm"
validate_choice "OTP_PROVIDER" "$OTP_PROVIDER_VALUE" "mock" "twilio"
validate_choice "SUPPORT_TRANSLATION_ENABLED" "$SUPPORT_TRANSLATION_ENABLED_INPUT" "true" "false"
validate_choice "QARGO_AI_ENABLED" "$QARGO_AI_ENABLED_INPUT" "true" "false"

if [[ "$ROUTE_PROVIDER_VALUE" == "google" ]]; then
  require_real_value "GOOGLE_MAPS_API_KEY" "$GOOGLE_MAPS_API_KEY_INPUT"
fi

if [[ "$KYC_PROVIDER_VALUE" == "idfy" ]]; then
  require_real_value "IDFY_API_KEY" "$IDFY_API_KEY_INPUT"
  require_real_value "IDFY_API_URL" "$IDFY_API_URL_INPUT"
  require_real_value "IDFY_ACCOUNT_ID" "$IDFY_ACCOUNT_ID_INPUT"
fi

if [[ "$KYC_PROVIDER_VALUE" == "cashfree" ]]; then
  require_real_value "CASHFREE_CLIENT_ID" "$CASHFREE_CLIENT_ID_INPUT"
  require_real_value "CASHFREE_CLIENT_SECRET" "$CASHFREE_CLIENT_SECRET_INPUT"
  require_real_value "CASHFREE_KYC_API_URL" "$CASHFREE_KYC_API_URL_INPUT"
fi

if [[ "$KYC_PROVIDER_VALUE" == "surepass" ]]; then
  require_real_value "SUREPASS_API_URL" "$SUREPASS_API_URL_INPUT"
  if is_placeholder "$SUREPASS_STATIC_BEARER_TOKEN_INPUT" &&
    is_placeholder "$SUREPASS_API_KEY_INPUT"; then
    echo "For KYC_PROVIDER=surepass, provide one auth mode:" >&2
    echo "  1) SUREPASS_STATIC_BEARER_TOKEN, or" >&2
    echo "  2) SUREPASS_API_KEY" >&2
    exit 1
  fi

  if is_placeholder "$SUREPASS_STATIC_BEARER_TOKEN_INPUT" &&
    [[ "$SUREPASS_API_KEY_INPUT" =~ ^eyJ[[:alnum:]_-]+\.[[:alnum:]_-]+\.[[:alnum:]_-]+$ ]]; then
    echo "Detected JWT-like Surepass token in SUREPASS_API_KEY. Using it as SUREPASS_STATIC_BEARER_TOKEN."
    SUREPASS_STATIC_BEARER_TOKEN_INPUT="$SUREPASS_API_KEY_INPUT"
    SUREPASS_API_KEY_INPUT=""
  fi
fi

if [[ "$PUSH_PROVIDER_VALUE" == "fcm" ]]; then
  require_real_value "FCM_SERVER_KEY" "$FCM_SERVER_KEY_INPUT"
fi

if [[ "$OTP_PROVIDER_VALUE" == "twilio" ]]; then
  require_real_value "TWILIO_ACCOUNT_SID" "$TWILIO_ACCOUNT_SID_INPUT"
  require_real_value "TWILIO_AUTH_TOKEN" "$TWILIO_AUTH_TOKEN_INPUT"
  require_real_value "TWILIO_MESSAGING_SERVICE_SID" "$TWILIO_MESSAGING_SERVICE_SID_INPUT"
  require_real_value "TWILIO_FROM_NUMBER" "$TWILIO_FROM_NUMBER_INPUT"
fi

if [[ "$SUPPORT_TRANSLATION_ENABLED_INPUT" == "true" ]]; then
  require_real_value "GOOGLE_TRANSLATE_API_KEY" "$GOOGLE_TRANSLATE_API_KEY_INPUT"
fi

if [[ "$QARGO_AI_ENABLED_INPUT" == "true" ]]; then
  require_real_value "OPENAI_API_KEY" "$OPENAI_API_KEY_INPUT"
fi

s3_settings_supplied=0
if ! is_placeholder "$S3_ENDPOINT_INPUT"; then
  s3_settings_supplied=1
fi
if ! is_placeholder "$S3_BUCKET_INPUT"; then
  s3_settings_supplied=1
fi
if ! is_placeholder "$S3_ACCESS_KEY_ID_INPUT"; then
  s3_settings_supplied=1
fi
if ! is_placeholder "$S3_SECRET_ACCESS_KEY_INPUT"; then
  s3_settings_supplied=1
fi

if [[ "$s3_settings_supplied" == "1" ]]; then
  require_real_value "S3_ENDPOINT" "$S3_ENDPOINT_INPUT"
  require_real_value "S3_BUCKET" "$S3_BUCKET_INPUT"
  require_real_value "S3_ACCESS_KEY_ID" "$S3_ACCESS_KEY_ID_INPUT"
  require_real_value "S3_SECRET_ACCESS_KEY" "$S3_SECRET_ACCESS_KEY_INPUT"
  require_real_value "S3_REGION" "$S3_REGION_INPUT"
fi

if is_placeholder "$ADMIN_PASSCODE_INPUT"; then
  echo "ADMIN_PASSCODE is required and cannot be empty or placeholder." >&2
  exit 1
fi

db_ref="\${{${POSTGRES_SERVICE}.DATABASE_URL}}"
redis_ref="\${{${REDIS_SERVICE}.REDIS_URL}}"
api_ref="https://\${{${BACKEND_SERVICE}.RAILWAY_PUBLIC_DOMAIN}}/api"

echo "Setting backend variables on service: $BACKEND_SERVICE"
set_var "$BACKEND_SERVICE" "DATABASE_URL=$db_ref"
set_var "$BACKEND_SERVICE" "REDIS_URL=$redis_ref"
set_var "$BACKEND_SERVICE" "JWT_SECRET=$JWT_SECRET_INPUT"
set_var "$BACKEND_SERVICE" "JWT_EXPIRES_IN=7d"
set_var "$BACKEND_SERVICE" "ADMIN_PASSCODE=$ADMIN_PASSCODE_INPUT"
set_var "$BACKEND_SERVICE" "SUPPORT_PHONE=$SUPPORT_PHONE_INPUT"
set_var "$BACKEND_SERVICE" "SUPPORT_TRANSLATION_ENABLED=$SUPPORT_TRANSLATION_ENABLED_INPUT"
set_var "$BACKEND_SERVICE" "SUPPORT_TRANSLATION_TARGET_LANGUAGE=$SUPPORT_TRANSLATION_TARGET_LANGUAGE_INPUT"
set_var "$BACKEND_SERVICE" "GOOGLE_TRANSLATE_API_URL=$GOOGLE_TRANSLATE_API_URL_INPUT"
set_var "$BACKEND_SERVICE" "QARGO_AI_ENABLED=$QARGO_AI_ENABLED_INPUT"
set_var "$BACKEND_SERVICE" "QARGO_AI_MODEL_DEFAULT=$QARGO_AI_MODEL_DEFAULT_INPUT"
set_var "$BACKEND_SERVICE" "QARGO_AI_MODEL_COMPLEX=$QARGO_AI_MODEL_COMPLEX_INPUT"
set_var "$BACKEND_SERVICE" "QARGO_AI_MAX_TOOL_CALLS_PER_RUN=$QARGO_AI_MAX_TOOL_CALLS_PER_RUN_INPUT"
set_var "$BACKEND_SERVICE" "QARGO_AI_MAX_TOKENS_PER_RUN=$QARGO_AI_MAX_TOKENS_PER_RUN_INPUT"
set_var "$BACKEND_SERVICE" "QARGO_AI_MAX_RUNS_PER_MINUTE=$QARGO_AI_MAX_RUNS_PER_MINUTE_INPUT"
set_var "$BACKEND_SERVICE" "NODE_ENV=production"
set_var "$BACKEND_SERVICE" "AUTH_MODE=otp"
set_var "$BACKEND_SERVICE" "OTP_PROVIDER=$OTP_PROVIDER_VALUE"
set_var "$BACKEND_SERVICE" "ROUTE_PROVIDER=$ROUTE_PROVIDER_VALUE"
set_var "$BACKEND_SERVICE" "KYC_PROVIDER=$KYC_PROVIDER_VALUE"
set_var "$BACKEND_SERVICE" "PUSH_PROVIDER=$PUSH_PROVIDER_VALUE"
set_var "$BACKEND_SERVICE" "OTP_TTL_SECONDS=300"
set_var "$BACKEND_SERVICE" "OTP_FIXED_CODE=123456"
set_var "$BACKEND_SERVICE" "DISPATCH_RADIUS_KM=8"
set_var "$BACKEND_SERVICE" "WAITING_RATE_PER_MINUTE=3"
set_var "$BACKEND_SERVICE" "BASE_FARE_PER_KM=14"
set_var_if_real "$BACKEND_SERVICE" "GOOGLE_MAPS_API_KEY" "$GOOGLE_MAPS_API_KEY_INPUT"
set_var_if_real "$BACKEND_SERVICE" "GOOGLE_TRANSLATE_API_KEY" "$GOOGLE_TRANSLATE_API_KEY_INPUT"
set_var_if_real "$BACKEND_SERVICE" "OPENAI_API_KEY" "$OPENAI_API_KEY_INPUT"
set_var_if_real "$BACKEND_SERVICE" "IDFY_API_KEY" "$IDFY_API_KEY_INPUT"
set_var_if_real "$BACKEND_SERVICE" "IDFY_API_URL" "$IDFY_API_URL_INPUT"
set_var_if_real "$BACKEND_SERVICE" "IDFY_ACCOUNT_ID" "$IDFY_ACCOUNT_ID_INPUT"
set_var_if_real "$BACKEND_SERVICE" "CASHFREE_CLIENT_ID" "$CASHFREE_CLIENT_ID_INPUT"
set_var_if_real "$BACKEND_SERVICE" "CASHFREE_CLIENT_SECRET" "$CASHFREE_CLIENT_SECRET_INPUT"
set_var_if_real "$BACKEND_SERVICE" "CASHFREE_KYC_API_URL" "$CASHFREE_KYC_API_URL_INPUT"
set_var "$BACKEND_SERVICE" "CASHFREE_API_VERSION=$CASHFREE_API_VERSION_INPUT"
set_var "$BACKEND_SERVICE" "CASHFREE_PAYMENTS_API_URL=$CASHFREE_PAYMENTS_API_URL_INPUT"
set_var_if_real "$BACKEND_SERVICE" "CASHFREE_WEBHOOK_SECRET" "$CASHFREE_WEBHOOK_SECRET_INPUT"
set_var_if_real "$BACKEND_SERVICE" "CASHFREE_PAYMENT_RETURN_URL" "$CASHFREE_PAYMENT_RETURN_URL_INPUT"
set_var "$BACKEND_SERVICE" "SUREPASS_API_URL=$SUREPASS_API_URL_INPUT"
set_var_if_real "$BACKEND_SERVICE" "SUREPASS_API_KEY" "$SUREPASS_API_KEY_INPUT"
set_var "$BACKEND_SERVICE" "SUREPASS_API_KEY_HEADER=$SUREPASS_API_KEY_HEADER_INPUT"
set_var_if_real "$BACKEND_SERVICE" "SUREPASS_STATIC_BEARER_TOKEN" "$SUREPASS_STATIC_BEARER_TOKEN_INPUT"
set_var "$BACKEND_SERVICE" "SUREPASS_DRIVING_LICENSE_PATH=$SUREPASS_DRIVING_LICENSE_PATH_INPUT"
set_var "$BACKEND_SERVICE" "SUREPASS_RC_PATH=$SUREPASS_RC_PATH_INPUT"
set_var_if_real "$BACKEND_SERVICE" "SUREPASS_RC_CHALLAN_PATH" "$SUREPASS_RC_CHALLAN_PATH_INPUT"
set_var_if_real "$BACKEND_SERVICE" "FCM_SERVER_KEY" "$FCM_SERVER_KEY_INPUT"
set_var_if_real "$BACKEND_SERVICE" "TWILIO_ACCOUNT_SID" "$TWILIO_ACCOUNT_SID_INPUT"
set_var_if_real "$BACKEND_SERVICE" "TWILIO_AUTH_TOKEN" "$TWILIO_AUTH_TOKEN_INPUT"
set_var_if_real "$BACKEND_SERVICE" "TWILIO_MESSAGING_SERVICE_SID" "$TWILIO_MESSAGING_SERVICE_SID_INPUT"
set_var_if_real "$BACKEND_SERVICE" "TWILIO_FROM_NUMBER" "$TWILIO_FROM_NUMBER_INPUT"
set_var_if_real "$BACKEND_SERVICE" "RAZORPAY_KEY_ID" "$RAZORPAY_KEY_ID_INPUT"
set_var_if_real "$BACKEND_SERVICE" "RAZORPAY_KEY_SECRET" "$RAZORPAY_KEY_SECRET_INPUT"
set_var_if_real "$BACKEND_SERVICE" "RAZORPAY_WEBHOOK_SECRET" "$RAZORPAY_WEBHOOK_SECRET_INPUT"
set_var_if_real "$BACKEND_SERVICE" "UPI_PAYEE_VPA" "$UPI_PAYEE_VPA_INPUT"
set_var "$BACKEND_SERVICE" "UPI_PAYEE_NAME=$UPI_PAYEE_NAME_INPUT"
set_var "$BACKEND_SERVICE" "GSTN_API_URL=https://sandbox.gstn.example"
set_var "$BACKEND_SERVICE" "EWAY_BILL_API_URL=https://sandbox.ewaybill.example"
set_var_if_real "$BACKEND_SERVICE" "EWAY_BILL_API_KEY" "$EWAY_BILL_API_KEY_INPUT"
set_var_if_real "$BACKEND_SERVICE" "INSURANCE_API_URL" "$INSURANCE_API_URL_INPUT"
set_var_if_real "$BACKEND_SERVICE" "INSURANCE_API_KEY" "$INSURANCE_API_KEY_INPUT"
set_var_if_real "$BACKEND_SERVICE" "S3_ENDPOINT" "$S3_ENDPOINT_INPUT"
set_var_if_real "$BACKEND_SERVICE" "S3_REGION" "$S3_REGION_INPUT"
set_var_if_real "$BACKEND_SERVICE" "S3_BUCKET" "$S3_BUCKET_INPUT"
set_var_if_real "$BACKEND_SERVICE" "S3_ACCESS_KEY_ID" "$S3_ACCESS_KEY_ID_INPUT"
set_var_if_real "$BACKEND_SERVICE" "S3_SECRET_ACCESS_KEY" "$S3_SECRET_ACCESS_KEY_INPUT"

if [[ "$SKIP_ADMIN" == "false" ]]; then
  echo "Setting admin variables on service: $ADMIN_SERVICE"
  set_var "$ADMIN_SERVICE" "NODE_ENV=production"
  set_var "$ADMIN_SERVICE" "NEXT_TELEMETRY_DISABLED=1"
  set_var "$ADMIN_SERVICE" "NEXT_PUBLIC_API_URL=$api_ref"
fi

echo
echo "Variables configured."
echo "Review in Railway UI, then deploy:"
echo "  railway up --service \"$BACKEND_SERVICE\" --detach"
if [[ "$SKIP_ADMIN" == "false" ]]; then
  echo "  railway up --service \"$ADMIN_SERVICE\" --detach"
fi
