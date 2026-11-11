'use client';

import React from 'react';
import Link from 'next/link';
import { fmtDate, useData } from '@/lib/client';
import { StatusBadge, LoadingBadge, TableLoadingRow, Msg } from '@/components/ui';
import { RefreshCw } from 'lucide-react';

export default function RFQsPage() {
  const { data, error, loading } = useData<any[]>('/api/rfqs');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Requests for Quotation (RFQ)
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Competitive sourcing. Quotes evaluated on 100-point algorithm: Landed Cost (60), Need-date ETA (25), Vendor OTIF & Quality (15).
          </p>
        </div>
      </div>

      <Msg err={error} />

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden w-full min-w-0">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[850px]">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">RFQ Number</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Origin PR</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Items Required</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Facility</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Quotes Due</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Need by Date</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Quoted / Invited</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {data?.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <Link
                      href={`/procurement/rfqs/${r.id}`}
                      className="font-mono font-bold text-brand-indigo hover:underline"
                    >
                      {r.rfq_no}
                    </Link>
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-600">
                    {r.pr_no ? (
                      <Link
                        href={`/procurement/prs/${r.pr_id}`}
                        className="hover:underline"
                      >
                        {r.pr_no}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700 max-w-[240px] truncate">
                    {r.items}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold text-slate-800">
                    {r.location_code}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 font-medium">
                    {fmtDate(r.due_date)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700 font-bold">
                    {fmtDate(r.need_date)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                    {r.quoted} / {r.invited}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <StatusBadge s={r.status} />
                  </td>
                </tr>
              ))}
              {loading && (!data || data.length === 0) ? (
                <TableLoadingRow
                  colSpan={8}
                  text="Fetching requests for quotation and vendor bids..."
                />
              ) : data && data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                    No RFQs active. Raise one from an approved requisition.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

