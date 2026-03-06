'use client';

import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export function DispatchChart() {
  return <DispatchChartWithData labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} values={[74, 69, 61, 58, 54, 57, 52]} />;
}

export function DispatchChartWithData({
  labels,
  values
}: {
  labels: string[];
  values: number[];
}) {
  return (
    <div className="rounded-3xl border border-orange-200 bg-white p-5 shadow-soft">
      <h3 className="font-sora text-lg text-brand-accent">Dispatch Latency Trend</h3>
      <p className="mb-4 font-manrope text-sm text-slate-600">Median time to assign a driver (seconds)</p>
      <Line
        data={{
          labels,
          datasets: [
            {
              label: 'Assignment Time',
              data: values,
              borderColor: '#F97316',
              backgroundColor: 'rgba(249, 115, 22, 0.25)',
              tension: 0.35
            }
          ]
        }}
        options={{
          responsive: true,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              ticks: {
                color: '#475569'
              },
              grid: {
                color: 'rgba(148, 163, 184, 0.2)'
              }
            },
            x: {
              ticks: {
                color: '#475569'
              },
              grid: {
                color: 'rgba(148, 163, 184, 0.15)'
              }
            }
          }
        }}
      />
    </div>
  );
}
