import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ChainPilot — Supply Chain Orchestration',
  description: 'Demand forecasting, MRP/DRP, procurement, production, logistics & control tower',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

