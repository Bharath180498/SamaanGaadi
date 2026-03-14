interface PaymentLike {
  provider?: string | null;
  status?: string | null;
  directPayToDriver?: boolean | null;
}

function toUpper(value?: string | null) {
  return String(value ?? '').trim().toUpperCase();
}

export function isCustomerPaymentPending(input: {
  orderStatus?: string | null;
  payment?: PaymentLike | null;
}) {
  const orderStatus = toUpper(input.orderStatus);
  const payment = input.payment;
  const provider = toUpper(payment?.provider);
  const status = toUpper(payment?.status) || 'PENDING';
  const directPayToDriver = Boolean(payment?.directPayToDriver);

  if (orderStatus === 'CANCELLED') {
    return false;
  }

  if (status === 'CAPTURED') {
    return false;
  }

  const isDelivered = orderStatus === 'DELIVERED';
  const isOfflineOrDriverDirectRail =
    provider === 'WALLET' || (provider === 'UPI' && directPayToDriver);

  if (isDelivered && (!payment || isOfflineOrDriverDirectRail)) {
    return false;
  }

  return true;
}

export function getCustomerPaymentStatusLabel(input: {
  orderStatus?: string | null;
  payment?: PaymentLike | null;
}) {
  const orderStatus = toUpper(input.orderStatus);
  const payment = input.payment;
  const provider = toUpper(payment?.provider);
  const status = toUpper(payment?.status) || 'PENDING';
  const directPayToDriver = Boolean(payment?.directPayToDriver);
  const isOfflineOrDriverDirectRail =
    provider === 'WALLET' || (provider === 'UPI' && directPayToDriver);

  if (status === 'CAPTURED') {
    return 'CAPTURED';
  }

  if (orderStatus === 'DELIVERED' && (!payment || isOfflineOrDriverDirectRail)) {
    return 'PAID TO DRIVER';
  }

  if (provider === 'WALLET' && status === 'PENDING') {
    return 'CASH ON DELIVERY';
  }

  return status;
}
