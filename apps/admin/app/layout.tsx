import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PorterX Admin Dashboard',
  description: 'Marketplace operations dashboard for logistics dispatch and fleet management.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-manrope text-brand-accent antialiased">{children}</body>
    </html>
  );
}
