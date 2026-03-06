import Link from 'next/link';
import type { ReactNode } from 'react';

const navItems = [
  { href: '/', label: 'Analytics' },
  { href: '/drivers', label: 'Driver Approvals' },
  { href: '/pricing', label: 'Pricing Rules' },
  { href: '/disputes', label: 'Disputes & Fraud' }
];

export function NavShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8 rounded-3xl border border-orange-200 bg-white/90 p-6 shadow-soft backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-400">PorterX Ops</p>
            <h1 className="font-sora text-3xl text-brand-accent">Marketplace Control Center</h1>
            <p className="font-manrope text-slate-600">
              Live dispatch health, driver quality, and revenue levers in one place.
            </p>
          </div>

          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 font-manrope text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
