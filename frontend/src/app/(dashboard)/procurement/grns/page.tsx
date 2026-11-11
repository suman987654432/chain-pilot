'use client';

import React from 'react';
import Link from 'next/link';
import { fmtDate, inr, useData } from '@/lib/client';
import { Button, LoadingBadge, TableLoadingRow, Msg } from '@/components/ui';
import { PackageCheck, Plus, RefreshCw } from 'lucide-react';

const n = (v: any) => Number(v ?? 0).toLocaleString('en-IN');

export default function GRNsPage() {
  const { data, error, loading } = useData<any[]>('/api/grns');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Goods Receipt Notes (GRN)
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Recorded receipts against approved purchase orders with quality inspection rejections.
          </p>
        </div>
        <Link href="/procurement/pos?status=RECEIVABLE">
          <Button variant="primary" className="gap-2 shadow-sm">
            <PackageCheck className="w-4 h-4" />
            <span>Receive against Purchase Order</span>
          </Button>
        </Link>
      </div>

      <Msg err={error} />

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0 w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[850px]">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3.5 whitespace-nowrap">GRN Number</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Receipt Date</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Origin PO</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Supplier</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Warehouse Facility</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Vendor Invoice / Challan</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Accepted Qty</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Rejected Qty</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Storekeeper</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {data?.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-bold text-slate-900">
                    {g.grn_no}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                    {fmtDate(g.received_on)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <Link
                      href={`/procurement/pos/${g.po_id}`}
                      className="font-mono font-bold text-brand-indigo hover:underline"
                    >
                      {g.po_no}
                    </Link>
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold text-slate-800">
                    {g.supplier}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                      {g.location_code}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-800">
                    {g.supplier_invoice}
                  </td>
                  <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-emerald-600">
                    {n(g.accepted)}
                  </td>
                  <td
                    className={`py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold ${
                      Number(g.rejected) > 0 ? 'text-rose-600' : 'text-slate-400'
                    }`}
                  >
                    {n(g.rejected)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-500">{g.received_by_name}</td>
                </tr>
              ))}
              {loading && (!data || data.length === 0) ? (
                <TableLoadingRow
                  colSpan={9}
                  text="Fetching goods receipt notes from warehouse ledger..."
                />
              ) : data && data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    No goods receipts recorded.
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

