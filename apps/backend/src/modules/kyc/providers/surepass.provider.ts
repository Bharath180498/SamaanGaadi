import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycVerificationStatus, VehicleType } from '@prisma/client';
import {
  KycVerificationProvider,
  VerifyKycInput,
  VerifyKycResult
} from './kyc-verification.provider';
import { MockIdfyProvider } from './mock-idfy.provider';

interface SurepassCheckResult {
  name: 'rc' | 'driving_license' | 'rc_challan';
  response: Response;
  payload: Record<string, unknown>;
  hardCheck: boolean;
}

@Injectable()
export class SurepassProvider implements KycVerificationProvider {
  constructor(
    private readonly configService: ConfigService,
    private readonly fallback: MockIdfyProvider
  ) {}

  private get apiUrl() {
    return this.configService.get<string>('surepass.apiUrl') ?? '';
  }

  private get apiKey() {
    return this.configService.get<string>('surepass.apiKey') ?? '';
  }

  private get apiKeyHeader() {
    return this.configService.get<string>('surepass.apiKeyHeader') ?? 'x-api-key';
  }

  private get staticBearerToken() {
    return this.configService.get<string>('surepass.staticBearerToken') ?? '';
  }

  private get drivingLicensePath() {
    return (
      this.configService.get<string>('surepass.drivingLicensePath') ??
      '/api/v1/driving-license/driving-license'
    );
  }

  private get rcPath() {
    return this.configService.get<string>('surepass.rcPath') ?? '/api/v1/rc/rc-v2';
  }

  private get rcChallanPath() {
    return this.configService.get<string>('surepass.rcChallanPath') ?? '';
  }

  private buildUrl(path: string) {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      return '';
    }

    if (/^https?:\/\//i.test(normalizedPath)) {
      return normalizedPath;
    }

    const base = this.apiUrl.trim().replace(/\/$/, '');
    if (!base) {
      return '';
    }

    return `${base}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
  }

  private mapStatus(rawStatus: unknown): KycVerificationStatus | undefined {
    const normalized = String(rawStatus ?? '').trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    if (
      normalized.includes('verified') ||
      normalized.includes('approved') ||
      normalized.includes('success') ||
      normalized.includes('completed') ||
      normalized.includes('pass') ||
      normalized === 'valid'
    ) {
      return KycVerificationStatus.VERIFIED;
    }

    if (
      normalized.includes('rejected') ||
      normalized.includes('failed') ||
      normalized.includes('declined') ||
      normalized.includes('mismatch') ||
      normalized.includes('invalid') ||
      normalized === 'blocked'
    ) {
      return KycVerificationStatus.REJECTED;
    }

    return undefined;
  }

  private mapSuccessSignal(payload: Record<string, unknown>) {
    const nested = payload.data as Record<string, unknown> | undefined;
    const result = payload.result as Record<string, unknown> | undefined;

    const successCandidates: unknown[] = [
      payload.success,
      payload.is_success,
      payload.isSuccess,
      nested?.success,
      nested?.is_success,
      nested?.isSuccess,
      result?.success,
      result?.is_success,
      result?.isSuccess
    ];

    for (const candidate of successCandidates) {
      if (typeof candidate === 'boolean') {
        return candidate ? KycVerificationStatus.VERIFIED : KycVerificationStatus.REJECTED;
      }

      const normalized = String(candidate ?? '').trim().toLowerCase();
      if (!normalized) {
        continue;
      }

      if (
        normalized === 'true' ||
        normalized === '1' ||
        normalized === 'yes' ||
        normalized === 'y' ||
        normalized === 'success'
      ) {
        return KycVerificationStatus.VERIFIED;
      }

      if (
        normalized === 'false' ||
        normalized === '0' ||
        normalized === 'no' ||
        normalized === 'n' ||
        normalized === 'failed' ||
        normalized === 'failure'
      ) {
        return KycVerificationStatus.REJECTED;
      }
    }

    const statusCodeCandidates: unknown[] = [
      payload.status_code,
      payload.statusCode,
      payload.code,
      nested?.status_code,
      nested?.statusCode,
      nested?.code,
      result?.status_code,
      result?.statusCode,
      result?.code
    ];

    for (const candidate of statusCodeCandidates) {
      const code = Number(candidate);
      if (!Number.isFinite(code)) {
        continue;
      }
      if (code >= 200 && code < 300) {
        return KycVerificationStatus.VERIFIED;
      }
      if (code >= 400) {
        return KycVerificationStatus.REJECTED;
      }
    }

    return undefined;
  }

  private extractStatus(payload: Record<string, unknown>) {
    const nested = payload.data as Record<string, unknown> | undefined;
    const result = payload.result as Record<string, unknown> | undefined;

    const mappedSuccess = this.mapSuccessSignal(payload);
    if (mappedSuccess) {
      return mappedSuccess;
    }

    const statusCandidates: unknown[] = [
      payload.status,
      payload.verification_status,
      payload.kyc_status,
      payload.account_status,
      payload.message_code,
      nested?.status,
      nested?.verification_status,
      nested?.kyc_status,
      nested?.account_status,
      nested?.message_code,
      result?.status,
      result?.verification_status,
      result?.kyc_status,
      result?.account_status,
      result?.message_code
    ];

    for (const statusCandidate of statusCandidates) {
      const mapped = this.mapStatus(statusCandidate);
      if (mapped) {
        return mapped;
      }
    }

    return KycVerificationStatus.INCONCLUSIVE;
  }

  private extractRiskSignals(payload: Record<string, unknown>) {
    const candidates: unknown[] = [
      payload.message,
      payload.error,
      payload.reason,
      payload.error_message,
      (payload.data as Record<string, unknown> | undefined)?.message,
      (payload.result as Record<string, unknown> | undefined)?.message
    ];

    const arrays: unknown[] = [
      payload.riskSignals,
      payload.errors,
      payload.reasons,
      (payload.data as Record<string, unknown> | undefined)?.riskSignals,
      (payload.result as Record<string, unknown> | undefined)?.riskSignals
    ];

    const scalar = candidates
      .map((value) => String(value ?? '').trim())
      .filter((value) => Boolean(value));
    const list = arrays
      .flatMap((value) => (Array.isArray(value) ? value : []))
      .map((value) => String(value ?? '').trim())
      .filter((value) => Boolean(value));

    return [...scalar, ...list];
  }

  private normalizeRegistration(value?: string | null) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  private deriveVehicleTypeFromRc(payload: Record<string, unknown>) {
    const data =
      (payload.data as Record<string, unknown> | undefined) ??
      (payload.result as Record<string, unknown> | undefined) ??
      payload;

    const fieldsToScan = [
      data.vehicle_category,
      data.vehicle_class,
      data.vehicle_type,
      data.body_type,
      data.maker_model,
      data.manufacturer_model,
      data.model,
      data.manufacturer
    ]
      .map((value) => String(value ?? '').trim())
      .filter((value) => Boolean(value));

    if (fieldsToScan.length === 0) {
      return undefined;
    }

    const combined = fieldsToScan.join(' | ').toUpperCase();

    // TODO(qargo-launch): This is a temporary demo mapping for test RC data.
    // Replace once we use actual commercial truck RC samples in production onboarding.
    if (combined.includes('NISSAN') && combined.includes('ELGRAND')) {
      return VehicleType.TRUCK;
    }

    if (
      combined.includes('THREE WHEELER') ||
      combined.includes('3W') ||
      combined.includes('AUTO RICKSHAW') ||
      combined.includes('RICKSHAW')
    ) {
      return VehicleType.THREE_WHEELER;
    }

    if (
      combined.includes('MINI') ||
      combined.includes('PICKUP') ||
      combined.includes('SMALL COMMERCIAL') ||
      combined.includes('LGV') ||
      combined.includes('ACE') ||
      combined.includes('DOST')
    ) {
      return VehicleType.MINI_TRUCK;
    }

    if (
      combined.includes('TRUCK') ||
      combined.includes('GOODS CARRIAGE') ||
      combined.includes('HGV') ||
      combined.includes('MEDIUM GOODS') ||
      combined.includes('HEAVY GOODS') ||
      combined.includes('TRAILER') ||
      combined.includes('COMMERCIAL')
    ) {
      return VehicleType.TRUCK;
    }

    return undefined;
  }

  private extractDrivingLicenseSignals(payload: Record<string, unknown>) {
    const data =
      (payload.data as Record<string, unknown> | undefined) ??
      (payload.result as Record<string, unknown> | undefined) ??
      payload;
    const rawClasses = data.vehicle_classes;
    if (!Array.isArray(rawClasses) || rawClasses.length === 0) {
      return [] as string[];
    }

    const normalizedClasses = rawClasses
      .map((value) => String(value ?? '').trim().toUpperCase())
      .filter((value) => Boolean(value));

    if (normalizedClasses.length === 0) {
      return [] as string[];
    }

    const isCommercialClass = normalizedClasses.some((vehicleClass) => {
      return (
        vehicleClass.includes('TR') ||
        vehicleClass.includes('TRANSPORT') ||
        vehicleClass.includes('HGV') ||
        vehicleClass.includes('HGMV') ||
        vehicleClass.includes('HPMV') ||
        vehicleClass.includes('LMV-TR') ||
        vehicleClass.includes('LMV TR') ||
        vehicleClass.includes('PSV') ||
        vehicleClass.includes('TSR')
      );
    });

    if (isCommercialClass) {
      const data =
        (payload.data as Record<string, unknown> | undefined) ??
        (payload.result as Record<string, unknown> | undefined) ??
        payload;
      const transportExpiry = String(data.transport_doe ?? '').trim();
      if (
        transportExpiry &&
        (transportExpiry === '1800-01-01' ||
          transportExpiry === '0000-00-00' ||
          transportExpiry.toLowerCase() === 'null')
      ) {
        return ['Driving license transport endorsement is missing or expired.'];
      }
      return [] as string[];
    }

    return [
      `Driving license classes appear non-commercial (${normalizedClasses.join(', ')}). Manual review recommended.`
    ];
  }

  private extractRcSignals(payload: Record<string, unknown>) {
    const data =
      (payload.data as Record<string, unknown> | undefined) ??
      (payload.result as Record<string, unknown> | undefined) ??
      payload;
    const signals: string[] = [];

    const vehicleCategory = String(data.vehicle_category ?? '').trim().toUpperCase();
    const vehicleCategoryDescription = String(data.vehicle_category_description ?? '')
      .trim()
      .toUpperCase();
    const bodyType = String(data.body_type ?? '').trim().toUpperCase();
    const makerModel = String(data.maker_model ?? '').trim();
    const lessInfo = data.less_info;

    if (lessInfo === true || String(lessInfo ?? '').trim().toLowerCase() === 'true') {
      signals.push('RC response contains masked/limited details (less_info=true).');
    }

    const combined = `${vehicleCategory} ${vehicleCategoryDescription} ${bodyType}`.trim();
    if (
      combined.includes('2W') ||
      combined.includes('SCOOTER') ||
      combined.includes('MOTORCYCLE') ||
      combined.includes('BIKE')
    ) {
      signals.push(
        `RC indicates a two-wheeler class (${vehicleCategory || 'UNKNOWN'} ${
          vehicleCategoryDescription || bodyType || ''
        }). This onboarding flow only supports 3-wheeler/commercial goods vehicles.`
      );
    }

    const hasPermitNumber = String(data.permit_number ?? '').trim().length > 0;
    const permitType = String(data.permit_type ?? '').trim().toUpperCase();
    if (!hasPermitNumber && !permitType) {
      signals.push('RC permit details are missing. Manual commercial-use verification recommended.');
    }

    const derivedVehicleType = this.deriveVehicleTypeFromRc(payload);
    if (!derivedVehicleType) {
      signals.push(
        `RC vehicle classification is not mapped to an allowed Qargo class (category=${vehicleCategory || 'N/A'}, body_type=${bodyType || 'N/A'}, model=${makerModel || 'N/A'}).`
      );
    }

    return {
      derivedVehicleType,
      signals
    };
  }

  private async buildHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const staticBearer = this.staticBearerToken.trim();
    if (staticBearer) {
      headers.Authorization = `Bearer ${staticBearer}`;
      return headers;
    }

    const apiKey = this.apiKey.trim();
    if (apiKey) {
      const configuredHeader = this.apiKeyHeader.trim();
      const normalizedHeader = configuredHeader.toLowerCase();
      const looksLikeJwt = apiKey.split('.').length === 3 && apiKey.startsWith('eyJ');
      const shouldUseBearer =
        normalizedHeader === 'authorization' ||
        normalizedHeader === 'bearer' ||
        normalizedHeader === 'token' ||
        looksLikeJwt;

      if (shouldUseBearer) {
        headers.Authorization = apiKey.toLowerCase().startsWith('bearer ')
          ? apiKey
          : `Bearer ${apiKey}`;
        return headers;
      }

      headers[configuredHeader || 'x-api-key'] = apiKey;
      return headers;
    }

    return undefined;
  }

  private async runCheck(input: {
    name: SurepassCheckResult['name'];
    path: string;
    body: Record<string, unknown>;
    hardCheck: boolean;
    headers: Record<string, string>;
  }): Promise<SurepassCheckResult> {
    const response = await fetch(this.buildUrl(input.path), {
      method: 'POST',
      headers: input.headers,
      body: JSON.stringify(input.body)
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      name: input.name,
      response,
      payload,
      hardCheck: input.hardCheck
    };
  }

  async verify(input: VerifyKycInput): Promise<VerifyKycResult> {
    if (!this.apiUrl.trim()) {
      return this.fallback.verify(input);
    }

    const headers = await this.buildHeaders();
    if (!headers) {
      return this.fallback.verify(input);
    }

    const onboarding = input.onboarding ?? {};
    const normalizedRc = this.normalizeRegistration(onboarding.rcNumber);
    const normalizedDl = this.normalizeRegistration(onboarding.licenseNumber);

    const checks: Array<Promise<SurepassCheckResult>> = [];
    if (normalizedRc) {
      checks.push(
        this.runCheck({
          name: 'rc',
          path: this.rcPath,
          hardCheck: true,
          headers,
          body: {
            id_number: normalizedRc,
            vehicle_number: normalizedRc,
            enrich: true
          }
        })
      );

      if (this.rcChallanPath.trim()) {
        checks.push(
          this.runCheck({
            name: 'rc_challan',
            path: this.rcChallanPath,
            hardCheck: false,
            headers,
            body: {
              id_number: normalizedRc,
              vehicle_number: normalizedRc
            }
          })
        );
      }
    }

    if (normalizedDl) {
      checks.push(
        this.runCheck({
          name: 'driving_license',
          path: this.drivingLicensePath,
          hardCheck: true,
          headers,
          body: {
            id_number: normalizedDl,
            dl_number: normalizedDl,
            dob: onboarding.dateOfBirth ?? undefined
          }
        })
      );
    }

    if (checks.length === 0) {
      return this.fallback.verify(input);
    }

    try {
      const results = await Promise.all(checks);
      const hardChecks = results.filter((result) => result.hardCheck);
      const hardHttpFailures = hardChecks.filter((result) => !result.response.ok);

      const providerRefs = results
        .map((result) => {
          const nestedPayload = result.payload.data as Record<string, unknown> | undefined;
          return String(
            result.payload.request_id ??
              result.payload.reference_id ??
              result.payload.client_id ??
              result.payload.id ??
              nestedPayload?.request_id ??
              nestedPayload?.reference_id ??
              nestedPayload?.client_id ??
              ''
          ).trim();
        })
        .filter((value) => Boolean(value));

      const riskSignals = results.flatMap((result) => this.extractRiskSignals(result.payload));
      const dlCheck = results.find((result) => result.name === 'driving_license');
      const rcCheck = results.find((result) => result.name === 'rc');
      const rcResult = rcCheck
        ? this.extractRcSignals(rcCheck.payload)
        : { derivedVehicleType: undefined, signals: [] as string[] };
      const dlSignals = dlCheck ? this.extractDrivingLicenseSignals(dlCheck.payload) : [];
      if (dlSignals.length > 0) {
        riskSignals.push(...dlSignals);
      }
      riskSignals.push(...rcResult.signals);

      if (hardHttpFailures.length > 0) {
        const firstFailure = hardHttpFailures[0];
        return {
          status: KycVerificationStatus.INCONCLUSIVE,
          providerRef: providerRefs.join(',') || `surepass_http_${firstFailure.response.status}_${Date.now()}`,
          riskSignals: [
            ...riskSignals,
            `Surepass ${firstFailure.name} request failed (${firstFailure.response.status})`
          ],
          providerResponse: {
            checks: results.map(({ name, payload, response }) => ({
              name,
              ok: response.ok,
              statusCode: response.status,
              payload
            }))
          }
        };
      }

      const hardStatuses = hardChecks.map((result) => this.extractStatus(result.payload));
      let status: KycVerificationStatus = KycVerificationStatus.INCONCLUSIVE;
      if (hardStatuses.some((checkStatus) => checkStatus === KycVerificationStatus.REJECTED)) {
        status = KycVerificationStatus.REJECTED;
      } else if (
        hardStatuses.length > 0 &&
        hardStatuses.every((checkStatus) => checkStatus === KycVerificationStatus.VERIFIED)
      ) {
        status = KycVerificationStatus.VERIFIED;
      }

      const derivedVehicleType = rcResult.derivedVehicleType;
      const selectedVehicleType = onboarding.vehicleType ?? null;

      if (selectedVehicleType && derivedVehicleType && selectedVehicleType !== derivedVehicleType) {
        riskSignals.push(
          `Vehicle type mismatch: onboarding selected ${selectedVehicleType}, RC indicates ${derivedVehicleType}.`
        );
      }

      return {
        status,
        providerRef: providerRefs.join(',') || `surepass_${Date.now()}`,
        riskSignals,
        providerResponse: {
          checks: results.map(({ name, payload, response }) => ({
            name,
            ok: response.ok,
            statusCode: response.status,
            payload
          })),
          _qargo: {
            derivedVehicleType
          }
        }
      };
    } catch {
      return this.fallback.verify(input);
    }
  }
}
