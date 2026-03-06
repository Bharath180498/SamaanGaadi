'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { NavShell } from '../../components/nav-shell';
import { fetcher, postJson } from '../../lib/api';

interface PricingRule {
  id: string;
  minDriverRating: number;
  maxDriverRating: number;
  multiplier: number;
}

export default function PricingPage() {
  const { data, mutate } = useSWR<PricingRule[]>('/pricing/rules', fetcher);

  const [minDriverRating, setMinDriverRating] = useState('4.5');
  const [maxDriverRating, setMaxDriverRating] = useState('4.8');
  const [multiplier, setMultiplier] = useState('0.97');

  const createRule = async () => {
    await postJson('/pricing/rules', {
      minDriverRating: Number(minDriverRating),
      maxDriverRating: Number(maxDriverRating),
      multiplier: Number(multiplier)
    });

    await mutate();
  };

  return (
    <NavShell>
      <section className="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
        <div className="rounded-3xl border border-orange-200 bg-white p-6 shadow-soft">
          <h2 className="font-sora text-xl text-brand-accent">Create Pricing Rule</h2>
          <p className="mt-1 font-manrope text-sm text-slate-600">
            Configure rating-based multipliers to tune conversion and utilization.
          </p>

          <div className="mt-5 space-y-3">
            <label className="block">
              <span className="font-manrope text-sm text-slate-700">Min Rating</span>
              <input
                className="mt-1 w-full rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 font-manrope"
                value={minDriverRating}
                onChange={(event) => setMinDriverRating(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="font-manrope text-sm text-slate-700">Max Rating</span>
              <input
                className="mt-1 w-full rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 font-manrope"
                value={maxDriverRating}
                onChange={(event) => setMaxDriverRating(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="font-manrope text-sm text-slate-700">Multiplier</span>
              <input
                className="mt-1 w-full rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 font-manrope"
                value={multiplier}
                onChange={(event) => setMultiplier(event.target.value)}
              />
            </label>

            <button
              className="mt-2 rounded-full bg-brand-primary px-4 py-2 font-manrope font-bold text-white"
              onClick={() => void createRule()}
            >
              Save Rule
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-orange-200 bg-white p-6 shadow-soft">
          <h2 className="font-sora text-xl text-brand-accent">Active Rules</h2>
          <div className="mt-4 space-y-3">
            {(data ?? []).map((rule) => (
              <article key={rule.id} className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <p className="font-manrope text-sm text-slate-700">
                  Rating {rule.minDriverRating} to {rule.maxDriverRating}
                </p>
                <p className="font-sora text-xl text-brand-secondary">x{rule.multiplier}</p>
              </article>
            ))}
            {(data?.length ?? 0) === 0 ? (
              <p className="font-manrope text-slate-600">No custom rules. Fallback defaults are active.</p>
            ) : null}
          </div>
        </div>
      </section>
    </NavShell>
  );
}
