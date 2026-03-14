'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { NavShell } from '../../components/nav-shell';
import { fetcher, postJson } from '../../lib/api';
import { mergeQargoAiContext } from '../../lib/qargo-ai-context';

interface KycQueueItem {
  id: string;
  status: string;
  createdAt: string;
  reviewedAt?: string | null;
  riskSignals: unknown;
  providerResponse?: unknown;
  reviewedByAdmin?: AdminActor | null;
  user: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  };
}

interface AdminActor {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

interface KycDocumentRecord {
  id: string;
  type: string;
  status: string;
  fileKey: string;
  fileUrl: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  providerRef: string | null;
  metadata: unknown;
  rejectionReason: string | null;
  createdAt: string;
}

interface VerificationRecord {
  id: string;
  provider: string;
  providerRef: string | null;
  status: string;
  riskSignals: unknown;
  providerResponse: unknown;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedByAdmin: AdminActor | null;
}

interface OnboardingRecord {
  id: string;
  status: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  licenseNumber: string | null;
  aadhaarNumber: string | null;
  rcNumber: string | null;
  accountHolderName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  upiId: string | null;
  upiQrImageUrl: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  updatedAt: string;
}

interface DriverProfileRecord {
  id: string;
  availabilityStatus: string;
  verificationStatus: string;
  vehicleType: string;
  vehicleCapacityKg: number;
  rating: number;
  totalTrips: number;
  completedTrips: number;
  cancelledTrips: number;
  vehicles: Array<{
    id: string;
    type: string;
    capacityKg: number;
    insuranceStatus: string;
    createdAt: string;
  }>;
  payoutAccount: {
    id: string;
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    upiId: string | null;
    upiQrImageUrl: string | null;
    isVerified: boolean;
  } | null;
  paymentMethods: Array<{
    id: string;
    type: string;
    label: string | null;
    upiId: string;
    qrImageUrl: string | null;
    isPreferred: boolean;
    isActive: boolean;
    createdAt: string;
  }>;
}

interface KycReviewDetails {
  verification: VerificationRecord;
  user: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    role: string;
    createdAt: string;
  };
  onboarding: OnboardingRecord | null;
  documents: KycDocumentRecord[];
  verificationHistory: VerificationRecord[];
  driverProfile: DriverProfileRecord | null;
}

function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString();
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string') {
    return value.trim() ? value : '—';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}

function statusTone(status: string) {
  const normalized = status.toUpperCase();

  if (normalized.includes('VERIFIED') || normalized.includes('APPROVED')) {
    return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30';
  }

  if (normalized.includes('REJECT')) {
    return 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30';
  }

  if (normalized.includes('INCONCLUSIVE') || normalized.includes('REVIEW')) {
    return 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30';
  }

  return 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30';
}

function toSignalList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((signal) => {
        if (typeof signal === 'string') {
          return signal.trim();
        }

        try {
          return JSON.stringify(signal);
        } catch {
          return String(signal);
        }
      })
      .filter((signal) => signal.length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const nestedCandidates = [
      row.riskSignals,
      row.risk_signals,
      row.alerts,
      row.result && typeof row.result === 'object' ? (row.result as Record<string, unknown>).riskSignals : undefined,
      row.result && typeof row.result === 'object' ? (row.result as Record<string, unknown>).risk_signals : undefined
    ];

    for (const candidate of nestedCandidates) {
      const signals = toSignalList(candidate);
      if (signals.length > 0) {
        return signals;
      }
    }

    try {
      return [JSON.stringify(row)];
    } catch {
      return [String(row)];
    }
  }

  return [] as string[];
}

function extractVerificationSignals(record: {
  riskSignals: unknown;
  providerResponse?: unknown;
}): string[] {
  const directSignals = toSignalList(record.riskSignals);
  if (directSignals.length > 0) {
    return directSignals;
  }

  return toSignalList(record.providerResponse);
}

function jsonPreview(value: unknown) {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function fileSizeLabel(value?: number | null) {
  if (!value || value <= 0) {
    return '—';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function DetailGrid({
  title,
  items
}: {
  title: string;
  items: Array<{ label: string; value: string | ReactNode }>;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <h4 className="font-sora text-base text-slate-100">{title}</h4>
      <dl className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex flex-wrap items-start justify-between gap-2">
            <dt className="font-manrope text-xs uppercase tracking-wide text-slate-500">{item.label}</dt>
            <dd className="max-w-full break-all text-right font-manrope text-sm text-slate-200">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function KycReviewsPage() {
  const [queueScope, setQueueScope] = useState<'pending' | 'approved'>('pending');
  const { data, isLoading, mutate } = useSWR<KycQueueItem[]>('/admin/kyc/pending', fetcher);
  const {
    data: approvedData,
    isLoading: approvedLoading,
    mutate: mutateApproved
  } = useSWR<KycQueueItem[]>('/admin/kyc/history?status=VERIFIED&limit=200', fetcher);
  const [selectedVerificationId, setSelectedVerificationId] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [rejectReason, setRejectReason] = useState('Documents did not pass manual review');
  const [actionError, setActionError] = useState<string>();

  const activeQueue = useMemo(
    () => (queueScope === 'approved' ? approvedData ?? [] : data ?? []),
    [approvedData, data, queueScope]
  );

  const queueLoading = queueScope === 'approved' ? approvedLoading : isLoading;

  const selectedDetailsPath = useMemo(
    () => (selectedVerificationId ? `/admin/kyc/${selectedVerificationId}` : null),
    [selectedVerificationId]
  );

  const { data: details, isLoading: detailsLoading, mutate: mutateDetails } = useSWR<KycReviewDetails>(
    selectedDetailsPath,
    fetcher
  );

  useEffect(() => {
    if (!activeQueue.length) {
      setSelectedVerificationId(undefined);
      return;
    }

    if (!selectedVerificationId || !activeQueue.some((entry) => entry.id === selectedVerificationId)) {
      setSelectedVerificationId(activeQueue[0].id);
    }
  }, [activeQueue, selectedVerificationId]);

  useEffect(() => {
    if (!details) {
      return;
    }

    setRejectReason(details.verification.reviewNotes ?? 'Documents did not pass manual review');
  }, [details?.verification.id]);

  useEffect(() => {
    mergeQargoAiContext({
      pagePath: '/kyc',
      kycVerificationId: selectedVerificationId
    });
  }, [selectedVerificationId]);

  const detailSignals = useMemo(
    () => (details ? extractVerificationSignals(details.verification) : []),
    [details]
  );

  const canTakeManualAction = useMemo(() => {
    const status = String(details?.verification.status ?? '').toUpperCase();
    return status === 'PENDING' || status === 'IN_REVIEW' || status === 'INCONCLUSIVE';
  }, [details?.verification.status]);

  const approve = async (verificationId: string) => {
    setActionError(undefined);
    setBusyId(verificationId);
    try {
      await postJson(`/admin/kyc/${verificationId}/approve`, {});
      await Promise.all([mutate(), mutateApproved(), mutateDetails()]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to approve verification');
    } finally {
      setBusyId(undefined);
    }
  };

  const reject = async (verificationId: string) => {
    setActionError(undefined);
    setBusyId(verificationId);
    try {
      await postJson(`/admin/kyc/${verificationId}/reject`, {
        reason: rejectReason.trim() || 'Documents did not pass manual review'
      });
      await Promise.all([mutate(), mutateApproved(), mutateDetails()]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to reject verification');
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <NavShell>
      <section className="grid gap-5 2xl:grid-cols-[minmax(330px,0.9fr)_minmax(0,1.7fr)]">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
          <h2 className="font-sora text-2xl text-slate-100">KYC Reviews</h2>
          <p className="mt-1 font-manrope text-sm text-slate-400">
            Switch between active review queue and approved KYC history.
          </p>

          <div className="mt-4 inline-flex rounded-lg border border-slate-700 bg-slate-950/70 p-1">
            <button
              type="button"
              onClick={() => setQueueScope('pending')}
              className={`rounded-md px-3 py-1.5 font-manrope text-xs font-semibold transition ${
                queueScope === 'pending'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              Pending Queue
            </button>
            <button
              type="button"
              onClick={() => setQueueScope('approved')}
              className={`rounded-md px-3 py-1.5 font-manrope text-xs font-semibold transition ${
                queueScope === 'approved'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              Approved History
            </button>
          </div>

          {queueLoading ? (
            <p className="mt-4 font-manrope text-slate-400">
              {queueScope === 'approved' ? 'Loading approved history...' : 'Loading pending queue...'}
            </p>
          ) : null}

          <div className="mt-5 space-y-3 overflow-auto pr-1 2xl:max-h-[74vh]">
            {activeQueue.map((entry) => {
              const isSelected = selectedVerificationId === entry.id;
              const signals = extractVerificationSignals(entry);

              return (
                <button
                  type="button"
                  key={entry.id}
                  onClick={() => setSelectedVerificationId(entry.id)}
                  className={`w-full rounded-lg border p-4 text-left transition ${
                    isSelected
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-sora text-base text-slate-100">{entry.user.name}</p>
                      <p className="font-manrope text-xs text-slate-400">{entry.user.phone}</p>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-xs ${statusTone(entry.status)}`}>{entry.status}</span>
                  </div>
                  <p className="mt-2 font-manrope text-xs text-slate-500">
                    Verification #{shortId(entry.id)} • Raised {formatDate(entry.createdAt)}
                  </p>
                  {queueScope === 'approved' ? (
                    <p className="mt-1 font-manrope text-xs text-emerald-300">
                      Reviewed {formatDate(entry.reviewedAt)} {entry.reviewedByAdmin ? `• ${entry.reviewedByAdmin.name}` : ''}
                    </p>
                  ) : null}
                  {signals.length ? (
                    <p className="mt-1 font-manrope text-xs text-amber-300">Signals: {signals.join(', ')}</p>
                  ) : null}
                </button>
              );
            })}
          </div>

          {!queueLoading && activeQueue.length === 0 ? (
            <p className="mt-4 font-manrope text-slate-400">
              {queueScope === 'approved' ? 'No approved KYC records found.' : 'No pending KYC reviews.'}
            </p>
          ) : null}
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/70 backdrop-blur">
          {!selectedVerificationId ? (
            <div className="p-6">
              <p className="font-manrope text-slate-400">Select a queue row to open full KYC review details.</p>
            </div>
          ) : null}

          {selectedVerificationId && detailsLoading ? (
            <div className="p-6">
              <p className="font-manrope text-slate-400">Loading verification details...</p>
            </div>
          ) : null}

          {selectedVerificationId && details ? (
            <div>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5">
                <div>
                  <h3 className="font-sora text-xl text-slate-100">
                    {details.user.name} • #{shortId(details.verification.id)}
                  </h3>
                  <p className="mt-1 font-manrope text-xs text-slate-400">
                    Submitted {formatDate(details.verification.createdAt)} • Updated {formatDate(details.verification.updatedAt)}
                  </p>
                </div>
                <span className={`rounded-md px-3 py-1 text-xs ${statusTone(details.verification.status)}`}>
                  {details.verification.status}
                </span>
              </header>

              <div className="space-y-5 p-5">
                <section className="rounded-lg border border-amber-600/30 bg-amber-500/5 p-4">
                  <h4 className="font-sora text-base text-amber-100">Risk Signals ({detailSignals.length})</h4>
                  {detailSignals.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {detailSignals.map((signal, index) => (
                        <li key={`${signal}-${index}`} className="rounded-md bg-slate-900/80 p-2 font-manrope text-sm text-amber-200">
                          {signal}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 font-manrope text-sm text-slate-400">
                      No risk signals reported by provider response for this verification.
                    </p>
                  )}
                </section>

                {canTakeManualAction ? (
                  <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <p className="font-manrope text-xs uppercase tracking-wide text-slate-500">Manual action</p>
                    <label className="mt-3 block">
                      <span className="font-manrope text-xs text-slate-400">Rejection reason</span>
                      <textarea
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-manrope text-sm text-slate-200 outline-none ring-cyan-500/50 focus:ring"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 font-manrope text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                        onClick={() => void approve(details.verification.id)}
                        disabled={busyId === details.verification.id}
                      >
                        {busyId === details.verification.id ? 'Saving...' : 'Approve'}
                      </button>
                      <button
                        className="rounded-md border border-rose-500/40 bg-rose-500/15 px-4 py-2 font-manrope text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
                        onClick={() => void reject(details.verification.id)}
                        disabled={busyId === details.verification.id}
                      >
                        {busyId === details.verification.id ? 'Saving...' : 'Reject'}
                      </button>
                    </div>
                    {actionError ? <p className="mt-2 font-manrope text-sm text-rose-300">{actionError}</p> : null}
                  </section>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-2">
                  <DetailGrid
                    title="Applicant"
                    items={[
                      { label: 'User ID', value: details.user.id },
                      { label: 'Role', value: details.user.role },
                      { label: 'Name', value: displayValue(details.user.name) },
                      { label: 'Phone', value: displayValue(details.user.phone) },
                      { label: 'Email', value: displayValue(details.user.email) },
                      { label: 'Account Created', value: formatDate(details.user.createdAt) }
                    ]}
                  />

                  <DetailGrid
                    title="Driver Profile"
                    items={[
                      {
                        label: 'Verification',
                        value: displayValue(details.driverProfile?.verificationStatus)
                      },
                      {
                        label: 'Availability',
                        value: displayValue(details.driverProfile?.availabilityStatus)
                      },
                      { label: 'Vehicle Type', value: displayValue(details.driverProfile?.vehicleType) },
                      { label: 'Vehicle Capacity', value: displayValue(details.driverProfile?.vehicleCapacityKg) },
                      {
                        label: 'Registered Vehicles',
                        value: displayValue(details.driverProfile?.vehicles?.length ?? 0)
                      },
                      { label: 'Rating', value: displayValue(details.driverProfile?.rating) },
                      {
                        label: 'Trips',
                        value: details.driverProfile
                          ? `${details.driverProfile.completedTrips}/${details.driverProfile.totalTrips} completed`
                          : '—'
                      }
                    ]}
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <DetailGrid
                    title="Onboarding Submission"
                    items={[
                      { label: 'Status', value: displayValue(details.onboarding?.status) },
                      { label: 'Full Name', value: displayValue(details.onboarding?.fullName) },
                      { label: 'Phone', value: displayValue(details.onboarding?.phone) },
                      { label: 'Email', value: displayValue(details.onboarding?.email) },
                      { label: 'City', value: displayValue(details.onboarding?.city) },
                      { label: 'Vehicle Type', value: displayValue(details.onboarding?.vehicleType) },
                      { label: 'Vehicle Number', value: displayValue(details.onboarding?.vehicleNumber) },
                      { label: 'License Number', value: displayValue(details.onboarding?.licenseNumber) },
                      { label: 'Aadhaar Number', value: displayValue(details.onboarding?.aadhaarNumber) },
                      { label: 'RC Number', value: displayValue(details.onboarding?.rcNumber) }
                    ]}
                  />

                  <DetailGrid
                    title="Bank & UPI"
                    items={[
                      {
                        label: 'Account Holder',
                        value: displayValue(details.onboarding?.accountHolderName)
                      },
                      { label: 'Bank Name', value: displayValue(details.onboarding?.bankName) },
                      { label: 'Account Number', value: displayValue(details.onboarding?.accountNumber) },
                      { label: 'IFSC', value: displayValue(details.onboarding?.ifscCode) },
                      { label: 'UPI ID', value: displayValue(details.onboarding?.upiId) },
                      {
                        label: 'UPI QR',
                        value: details.onboarding?.upiQrImageUrl ? (
                          <a
                            href={details.onboarding.upiQrImageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 underline underline-offset-2"
                          >
                            Open QR
                          </a>
                        ) : (
                          '—'
                        )
                      },
                      { label: 'Submitted At', value: formatDate(details.onboarding?.submittedAt) },
                      { label: 'Approved At', value: formatDate(details.onboarding?.approvedAt) },
                      { label: 'Rejected At', value: formatDate(details.onboarding?.rejectedAt) },
                      { label: 'Rejection Reason', value: displayValue(details.onboarding?.rejectionReason) }
                    ]}
                  />
                </div>

                <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                  <h4 className="font-sora text-base text-slate-100">Payout Configuration</h4>
                  <div className="mt-3 grid gap-4 xl:grid-cols-2">
                    <DetailGrid
                      title="Payout Account"
                      items={[
                        {
                          label: 'Account Holder',
                          value: displayValue(details.driverProfile?.payoutAccount?.accountHolderName)
                        },
                        {
                          label: 'Bank Name',
                          value: displayValue(details.driverProfile?.payoutAccount?.bankName)
                        },
                        {
                          label: 'Account Number',
                          value: displayValue(details.driverProfile?.payoutAccount?.accountNumber)
                        },
                        {
                          label: 'IFSC',
                          value: displayValue(details.driverProfile?.payoutAccount?.ifscCode)
                        },
                        { label: 'UPI ID', value: displayValue(details.driverProfile?.payoutAccount?.upiId) },
                        {
                          label: 'UPI QR',
                          value: details.driverProfile?.payoutAccount?.upiQrImageUrl ? (
                            <a
                              href={details.driverProfile.payoutAccount.upiQrImageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-300 underline underline-offset-2"
                            >
                              Open QR
                            </a>
                          ) : (
                            '—'
                          )
                        },
                        {
                          label: 'Verified',
                          value: details.driverProfile?.payoutAccount?.isVerified ? 'Yes' : 'No'
                        }
                      ]}
                    />

                    <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                      <h5 className="font-sora text-sm text-slate-100">
                        Active Payment Methods ({details.driverProfile?.paymentMethods.length ?? 0})
                      </h5>
                      <div className="mt-2 space-y-2">
                        {(details.driverProfile?.paymentMethods ?? []).map((method) => (
                          <article key={method.id} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                            <p className="font-manrope text-sm text-slate-100">
                              {method.type} {method.label ? `• ${method.label}` : ''}
                            </p>
                            <p className="mt-1 font-manrope text-xs text-slate-400">UPI: {method.upiId}</p>
                            <p className="mt-1 font-manrope text-xs text-slate-500">
                              Preferred: {method.isPreferred ? 'Yes' : 'No'} • Active: {method.isActive ? 'Yes' : 'No'}
                            </p>
                            {method.qrImageUrl ? (
                              <a
                                href={method.qrImageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-block font-manrope text-xs text-cyan-300 underline underline-offset-2"
                              >
                                Open payment QR
                              </a>
                            ) : null}
                          </article>
                        ))}
                        {(details.driverProfile?.paymentMethods.length ?? 0) === 0 ? (
                          <p className="font-manrope text-sm text-slate-400">No active payment methods found.</p>
                        ) : null}
                      </div>
                    </section>
                  </div>

                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <h5 className="font-sora text-sm text-slate-100">
                      Vehicle Records ({details.driverProfile?.vehicles.length ?? 0})
                    </h5>
                    <div className="mt-2 space-y-2">
                      {(details.driverProfile?.vehicles ?? []).map((vehicle) => (
                        <article key={vehicle.id} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                          <p className="font-manrope text-sm text-slate-100">
                            {vehicle.type} • {vehicle.capacityKg} kg
                          </p>
                          <p className="mt-1 font-manrope text-xs text-slate-400">
                            Insurance: {vehicle.insuranceStatus}
                          </p>
                          <p className="mt-1 font-manrope text-xs text-slate-500">
                            Added: {formatDate(vehicle.createdAt)}
                          </p>
                        </article>
                      ))}
                      {(details.driverProfile?.vehicles.length ?? 0) === 0 ? (
                        <p className="font-manrope text-sm text-slate-400">No vehicle records found.</p>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                  <h4 className="font-sora text-base text-slate-100">
                    Uploaded Documents ({details.documents.length})
                  </h4>
                  <div className="mt-3 overflow-auto">
                    <table className="min-w-full border-collapse text-left font-manrope text-sm">
                      <thead className="border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Type</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Uploaded</th>
                          <th className="px-3 py-2 font-semibold">File</th>
                          <th className="px-3 py-2 font-semibold">Metadata</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.documents.map((document) => (
                          <tr key={document.id} className="border-b border-slate-800/60 text-slate-200">
                            <td className="px-3 py-3">
                              <p>{document.type}</p>
                              <p className="text-xs text-slate-500">#{shortId(document.id)}</p>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`rounded-md px-2 py-0.5 text-xs ${statusTone(document.status)}`}>
                                {document.status}
                              </span>
                              <p className="mt-1 text-xs text-slate-500">
                                {document.rejectionReason ? `Reason: ${document.rejectionReason}` : 'No rejection reason'}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-400">{formatDate(document.createdAt)}</td>
                            <td className="px-3 py-3">
                              <a
                                href={document.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-300 underline underline-offset-2"
                              >
                                Open file
                              </a>
                              <p className="mt-1 text-xs text-slate-500">
                                {fileSizeLabel(document.fileSizeBytes)} • {displayValue(document.mimeType)}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <pre className="max-h-28 overflow-auto rounded-md bg-slate-950 p-2 text-xs text-slate-400">
                                {jsonPreview(document.metadata)}
                              </pre>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {details.documents.length === 0 ? (
                    <p className="mt-3 font-manrope text-sm text-slate-400">No KYC documents uploaded yet.</p>
                  ) : null}
                </section>

                <div className="grid gap-4 xl:grid-cols-2">
                  <DetailGrid
                    title="Provider Decision"
                    items={[
                      { label: 'Provider', value: details.verification.provider },
                      { label: 'Provider Ref', value: displayValue(details.verification.providerRef) },
                      { label: 'Status', value: details.verification.status },
                      { label: 'Created', value: formatDate(details.verification.createdAt) },
                      { label: 'Reviewed', value: formatDate(details.verification.reviewedAt) },
                      { label: 'Review Notes', value: displayValue(details.verification.reviewNotes) },
                      {
                        label: 'Reviewed By',
                        value: details.verification.reviewedByAdmin
                          ? `${details.verification.reviewedByAdmin.name} (${details.verification.reviewedByAdmin.phone})`
                          : '—'
                      }
                    ]}
                  />

                  <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <h4 className="font-sora text-base text-slate-100">Risk Signals Snapshot</h4>
                    {detailSignals.length ? (
                      <ul className="mt-3 space-y-2">
                        {detailSignals.map((signal, index) => (
                          <li key={`${signal}-${index}`} className="rounded-md bg-slate-900/80 p-2 font-manrope text-sm text-amber-200">
                            {signal}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 font-manrope text-sm text-slate-400">No risk signals reported.</p>
                    )}
                  </section>
                </div>

                <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                  <h4 className="font-sora text-base text-slate-100">Provider Response</h4>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-300">
                    {jsonPreview(details.verification.providerResponse)}
                  </pre>
                </section>

                <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                  <h4 className="font-sora text-base text-slate-100">
                    Verification History ({details.verificationHistory.length})
                  </h4>
                  <div className="mt-3 space-y-2">
                    {details.verificationHistory.map((historyEntry) => {
                      const historySignals = extractVerificationSignals(historyEntry);

                      return (
                        <article key={historyEntry.id} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-manrope text-sm text-slate-200">
                            #{shortId(historyEntry.id)} • {historyEntry.provider}
                          </p>
                          <span className={`rounded-md px-2 py-0.5 text-xs ${statusTone(historyEntry.status)}`}>
                            {historyEntry.status}
                          </span>
                        </div>
                        <p className="mt-1 font-manrope text-xs text-slate-500">
                          {formatDate(historyEntry.createdAt)} • Provider Ref: {displayValue(historyEntry.providerRef)}
                        </p>
                        <p className="mt-1 font-manrope text-xs text-slate-500">
                          Reviewed: {formatDate(historyEntry.reviewedAt)} •{' '}
                          {historyEntry.reviewedByAdmin
                            ? `${historyEntry.reviewedByAdmin.name} (${historyEntry.reviewedByAdmin.phone})`
                            : '—'}
                        </p>
                        {historySignals.length ? (
                          <p className="mt-2 font-manrope text-xs text-amber-300">
                            Signals: {historySignals.join(' • ')}
                          </p>
                        ) : (
                          <p className="mt-2 font-manrope text-xs text-slate-500">Signals: none reported</p>
                        )}
                        {historyEntry.reviewNotes ? (
                          <p className="mt-2 font-manrope text-xs text-slate-300">Review note: {historyEntry.reviewNotes}</p>
                        ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          ) : null}
        </article>
      </section>
    </NavShell>
  );
}
