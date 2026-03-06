'use client';

import useSWR from 'swr';
import { NavShell } from '../components/nav-shell';
import { DispatchChartWithData } from '../components/dispatch-chart';
import { fetcher } from '../lib/api';

interface OverviewResponse {
  fleet: {
    onlineDrivers: number;
    busyDrivers: number;
    pendingApprovals: number;
  };
  demand: {
    tripsToday: number;
    activeOrders: number;
    completedOrders: number;
  };
  economics: {
    deliveredGrossRevenue: number;
  };
}

interface TripAnalyticsResponse {
  series: Array<{
    day: string;
    assignments: number;
    completed: number;
    completionRate: number;
    avgEtaMinutes: number | null;
  }>;
}

interface HeatmapResponse {
  cells: Array<{
    lat: number;
    lng: number;
    demand: number;
    vehicleMix: Record<string, number>;
  }>;
}

interface ComplianceResponse {
  insuranceCoverageOrders: number;
  ewayBillsGenerated: number;
  scheduledDispatchOrders: number;
  activeTripsMonitored: number;
}

export default function DashboardPage() {
  const { data: overview } = useSWR<OverviewResponse>('/admin/overview', fetcher);
  const { data: analytics } = useSWR<TripAnalyticsResponse>('/admin/analytics/trips', fetcher);
  const { data: heatmap } = useSWR<HeatmapResponse>('/admin/analytics/heatmap', fetcher);
  const { data: compliance } = useSWR<ComplianceResponse>('/admin/compliance', fetcher);

  const kpis = [
    {
      label: 'Online Drivers',
      value: overview?.fleet.onlineDrivers ?? '--',
      delta: `${overview?.fleet.busyDrivers ?? 0} busy`
    },
    {
      label: 'Trips Today',
      value: overview?.demand.tripsToday ?? '--',
      delta: `${overview?.demand.completedOrders ?? 0} completed`
    },
    {
      label: 'Active Orders',
      value: overview?.demand.activeOrders ?? '--',
      delta: `${overview?.fleet.pendingApprovals ?? 0} pending approvals`
    },
    {
      label: 'Delivered Revenue',
      value:
        overview?.economics.deliveredGrossRevenue !== undefined
          ? `INR ${overview.economics.deliveredGrossRevenue.toFixed(0)}`
          : '--',
      delta: 'Delivered trips only'
    }
  ];

  const labels = analytics?.series.map((entry) => entry.day.slice(5)) ?? [];
  const values = analytics?.series.map((entry) => entry.avgEtaMinutes ?? 0) ?? [];

  return (
    <NavShell>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="rounded-3xl border border-orange-200 bg-white p-5 shadow-soft">
            <p className="font-manrope text-sm text-slate-500">{kpi.label}</p>
            <h2 className="mt-1 font-sora text-3xl text-brand-accent">{kpi.value}</h2>
            <p className="mt-2 font-manrope text-sm font-semibold text-brand-secondary">{kpi.delta}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[2fr,1fr]">
        <DispatchChartWithData labels={labels} values={values} />

        <aside className="rounded-3xl border border-orange-200 bg-white p-5 shadow-soft">
          <h3 className="font-sora text-lg text-brand-accent">Demand Heat Cells (Top 5)</h3>
          <ul className="mt-4 space-y-3 font-manrope text-sm text-slate-600">
            {(heatmap?.cells ?? []).slice(0, 5).map((cell) => (
              <li key={`${cell.lat}-${cell.lng}`}>
                ({cell.lat}, {cell.lng}) • {cell.demand} requests • mix {Object.entries(cell.vehicleMix)
                  .map(([type, count]) => `${type}:${count}`)
                  .join(' ')}
              </li>
            ))}
            {(heatmap?.cells?.length ?? 0) === 0 ? <li>No demand data yet.</li> : null}
          </ul>
        </aside>
      </section>

      <section className="mt-6 rounded-3xl border border-orange-200 bg-white p-5 shadow-soft">
        <h3 className="font-sora text-lg text-brand-accent">Compliance Snapshot</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-manrope text-xs text-amber-900">Insured Orders</p>
            <p className="mt-1 font-sora text-2xl text-amber-800">
              {compliance?.insuranceCoverageOrders ?? '--'}
            </p>
          </article>
          <article className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
            <p className="font-manrope text-xs text-teal-900">E-Way Bills Generated</p>
            <p className="mt-1 font-sora text-2xl text-teal-800">
              {compliance?.ewayBillsGenerated ?? '--'}
            </p>
          </article>
          <article className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="font-manrope text-xs text-indigo-900">Scheduled Orders</p>
            <p className="mt-1 font-sora text-2xl text-indigo-800">
              {compliance?.scheduledDispatchOrders ?? '--'}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-manrope text-xs text-slate-700">Active Trips Monitored</p>
            <p className="mt-1 font-sora text-2xl text-slate-800">
              {compliance?.activeTripsMonitored ?? '--'}
            </p>
          </article>
        </div>
      </section>
    </NavShell>
  );
}
