'use client';

import useSWR from 'swr';
import { NavShell } from '../../components/nav-shell';
import { fetcher } from '../../lib/api';

interface FraudAlerts {
  count: number;
  alerts: Array<{
    tripId: string;
    orderId: string;
    driverId: string;
    driverName: string;
    createdAt: string;
    riskSignals: string[];
    severity: 'HIGH' | 'MEDIUM';
  }>;
}

export default function DisputesPage() {
  const { data, isLoading } = useSWR<FraudAlerts>('/admin/fraud-alerts', fetcher);

  return (
    <NavShell>
      <section className="rounded-3xl border border-orange-200 bg-white p-6 shadow-soft">
        <h2 className="font-sora text-2xl text-brand-accent">Disputes & Fraud Monitoring</h2>
        <p className="mt-1 font-manrope text-slate-600">
          Real-time risk queue based on waiting-charge anomalies, speed anomalies, and quality score.
        </p>

        {isLoading ? <p className="mt-4 font-manrope text-slate-600">Loading alerts...</p> : null}

        <div className="mt-6 grid gap-4">
          {(data?.alerts ?? []).map((item) => (
            <article
              key={item.tripId}
              className="rounded-2xl border border-orange-200 bg-orange-50 p-4 md:flex md:items-start md:justify-between"
            >
              <div>
                <p className="font-sora text-lg text-brand-accent">Trip {item.tripId.slice(0, 8)}</p>
                <p className="font-manrope text-sm text-slate-700">Order {item.orderId.slice(0, 8)}</p>
                <p className="font-manrope text-sm text-slate-600">Driver: {item.driverName}</p>
                <p className="font-manrope text-xs text-slate-500">{item.riskSignals.join(' • ')}</p>
              </div>
              <span
                className={`mt-3 inline-flex rounded-full px-3 py-1 font-manrope text-xs font-bold md:mt-0 ${
                  item.severity === 'HIGH' ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-800'
                }`}
              >
                {item.severity}
              </span>
            </article>
          ))}

          {!isLoading && (data?.alerts?.length ?? 0) === 0 ? (
            <p className="font-manrope text-slate-600">No risk alerts right now.</p>
          ) : null}
        </div>
      </section>
    </NavShell>
  );
}
