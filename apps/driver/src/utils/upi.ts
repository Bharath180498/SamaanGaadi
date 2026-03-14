const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/i;

export function normalizeUpiId(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUpiId(value: string) {
  return UPI_PATTERN.test(value);
}

interface BuildUpiIntentInput {
  upiId: string;
  payeeName?: string;
  note?: string;
  amountInr?: number;
  transactionRef?: string;
}

export function buildUpiIntentUrl(input: BuildUpiIntentInput) {
  const normalizedUpiId = normalizeUpiId(input.upiId);
  if (!isValidUpiId(normalizedUpiId)) {
    return undefined;
  }

  const params = new URLSearchParams({
    pa: normalizedUpiId,
    pn: (input.payeeName ?? 'Qargo Driver').trim() || 'Qargo Driver',
    cu: 'INR',
    tn: (input.note ?? 'Qargo ride payment').trim() || 'Qargo ride payment'
  });

  if (typeof input.amountInr === 'number' && Number.isFinite(input.amountInr) && input.amountInr > 0) {
    params.set('am', input.amountInr.toFixed(2));
  }

  if (input.transactionRef?.trim()) {
    params.set('tr', input.transactionRef.trim());
  }

  return `upi://pay?${params.toString()}`;
}

export function buildUpiQrImageUrl(input: BuildUpiIntentInput) {
  const upiIntentUrl = buildUpiIntentUrl(input);
  if (!upiIntentUrl) {
    return undefined;
  }

  return `https://api.qrserver.com/v1/create-qr-code/?size=640x640&format=png&qzone=2&data=${encodeURIComponent(
    upiIntentUrl
  )}`;
}
