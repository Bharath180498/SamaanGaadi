'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { NavShell } from '../../components/nav-shell';
import { fetcher, postJson } from '../../lib/api';

interface PendingDriver {
  id: string;
  vehicleType: string;
  vehicleNumber: string;
  licenseNumber: string;
  user: {
    name: string;
    phone: string;
  };
}

export default function DriverApprovalsPage() {
  const { data, isLoading, mutate } = useSWR<PendingDriver[]>('/drivers/admin/pending-approvals', fetcher);
  const [busyId, setBusyId] = useState<string>();

  const approve = async (driverId: string) => {
    setBusyId(driverId);
    await postJson(`/drivers/${driverId}/approve`, {});
    setBusyId(undefined);
    await mutate();
  };

  const reject = async (driverId: string) => {
    setBusyId(driverId);
    await postJson(`/drivers/${driverId}/reject`, {});
    setBusyId(undefined);
    await mutate();
  };

  return (
    <NavShell>
      <section className="rounded-3xl border border-orange-200 bg-white p-6 shadow-soft">
        <h2 className="font-sora text-2xl text-brand-accent">Driver Verification Queue</h2>
        <p className="mt-1 font-manrope text-slate-600">Approve verified drivers and activate fleet capacity.</p>

        {isLoading ? <p className="mt-4 font-manrope text-slate-600">Loading queue...</p> : null}

        <div className="mt-6 grid gap-4">
          {(data ?? []).map((driver) => (
            <article
              key={driver.id}
              className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 md:flex md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <p className="font-sora text-lg text-brand-accent">{driver.user.name}</p>
                <p className="font-manrope text-sm text-slate-600">{driver.user.phone}</p>
                <p className="font-manrope text-sm text-slate-600">
                  {driver.vehicleType} · {driver.vehicleNumber}
                </p>
                <p className="font-manrope text-xs text-slate-500">License: {driver.licenseNumber}</p>
              </div>

              <div className="mt-3 flex gap-2 md:mt-0">
                <button
                  className="rounded-full bg-brand-secondary px-5 py-2 font-manrope text-sm font-bold text-white transition hover:opacity-90"
                  onClick={() => void approve(driver.id)}
                  disabled={busyId === driver.id}
                >
                  {busyId === driver.id ? 'Saving...' : 'Approve'}
                </button>
                <button
                  className="rounded-full border border-rose-300 bg-rose-100 px-5 py-2 font-manrope text-sm font-bold text-rose-800 transition hover:bg-rose-200"
                  onClick={() => void reject(driver.id)}
                  disabled={busyId === driver.id}
                >
                  Reject
                </button>
              </div>
            </article>
          ))}

          {!isLoading && (data?.length ?? 0) === 0 ? (
            <p className="font-manrope text-slate-600">No pending approvals right now.</p>
          ) : null}
        </div>
      </section>
    </NavShell>
  );
}
