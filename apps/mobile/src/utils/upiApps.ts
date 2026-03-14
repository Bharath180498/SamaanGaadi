import { Linking } from 'react-native';

export interface UpiAppLaunchResult {
  opened: boolean;
  appLabel?: string;
}

interface UpiAppCandidate {
  id: string;
  label: string;
  url: string;
}

function extractUpiQuery(upiIntentUrl: string) {
  const trimmed = upiIntentUrl.trim();
  if (!trimmed) {
    return undefined;
  }

  const markerIndex = trimmed.indexOf('?');
  if (markerIndex === -1) {
    return undefined;
  }

  return trimmed.slice(markerIndex + 1);
}

function buildUpiCandidates(upiIntentUrl: string) {
  const query = extractUpiQuery(upiIntentUrl);
  if (!query) {
    return [] as UpiAppCandidate[];
  }

  const encodedQuery = query.trim();
  const genericUpiUrl = `upi://pay?${encodedQuery}`;

  return [
    { id: 'gpay', label: 'Google Pay', url: `tez://upi/pay?${encodedQuery}` },
    { id: 'phonepe', label: 'PhonePe', url: `phonepe://pay?${encodedQuery}` },
    { id: 'paytm', label: 'Paytm', url: `paytmmp://pay?${encodedQuery}` },
    { id: 'bhim', label: 'BHIM', url: `bhim://upi/pay?${encodedQuery}` },
    { id: 'generic', label: 'UPI app', url: genericUpiUrl }
  ];
}

export async function openBestUpiApp(upiIntentUrl: string): Promise<UpiAppLaunchResult> {
  const candidates = buildUpiCandidates(upiIntentUrl);

  for (const candidate of candidates) {
    try {
      const supported = await Linking.canOpenURL(candidate.url);
      if (!supported) {
        continue;
      }

      await Linking.openURL(candidate.url);
      return {
        opened: true,
        appLabel: candidate.label
      };
    } catch {
      // Try next installed app fallback.
    }
  }

  try {
    const supported = await Linking.canOpenURL(upiIntentUrl);
    if (supported) {
      await Linking.openURL(upiIntentUrl);
      return {
        opened: true,
        appLabel: 'UPI app'
      };
    }
  } catch {
    // Fall through to not opened.
  }

  return {
    opened: false
  };
}
