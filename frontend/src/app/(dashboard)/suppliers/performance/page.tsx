'use client';

import React from 'react';
import Link from 'next/link';
import { useData } from '@/lib/client';
import { Button, StatusBadge, LoadingBadge, TableLoadingRow, Msg } from '@/components/ui';
import { ArrowLeft, Award, AlertTriangle, RefreshCw } from 'lucide-react';

const pc = (a: number, b: number) =>
  b ? Math.round((1000 * a) / b) / 10 : null;

export default function SupplierScorecardPage() {
  const { data, error, loading } = useData<any[]>('/api/suppliers');

  const rows = (data ?? []).map((s) => {
    const otif = pc(Number(s.lines_otif), Number(s.lines_due));
    const q = Number(s.qty_received)
      ? Math.round(
          (1000 * (1 - Number(s.qty_rejected) / Number(s.qty_received))) / 10
        )
      : null;
    const score =
      otif == null ? null : Math.round(0.6 * otif + 0.4 * (q ?? 100));
    const grade =
      score == null
        ? '—'
        : score >= 90
        ? 'A'
        : score >= 75
        ? 'B'
        : score >= 60
        ? 'C'
        : 'D';

    return { ...s, otif, q, score, grade };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/suppliers"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Supplier Delivery Performance Scorecard
              </h1>
              {loading && <LoadingBadge text="Loading..." />}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Automated vendor evaluation: 60% On-Time In-Full (OTIF) + 40% Quality Acceptance Rate.
            </p>
          </div>
        </div>
      </div>

      <Msg err={error} />

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <b>Procurement Policy Governance:</b>
          <p className="mt-0.5 text-amber-800">
            A purchase order line is scored once complete, closed short, or past due date. Grade D suppliers are flagged to move to CONDITIONAL status, requiring explicit management approval for every future PO.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0 w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[960px]">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Supplier Name</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">POs Received</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Lines Due</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">OTIF %</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Quality %</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Total Units Recd</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Units Rejected</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Late Open POs</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Score</th>
                <th className="py-2.5 px-3.5 text-center whitespace-nowrap">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                        {s.code}
                      </span>
                      <span className="font-bold text-slate-900 text-xs truncate max-w-[170px]" title={s.name}>
                        {s.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <StatusBadge s={s.status} />
                  </td>
                  <td className="py-2.5 px-3.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                    {s.pos_received ?? 0}
                  </td>
                  <td className="py-2.5 px-3.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                    {s.lines_due ?? 0}
                  </td>
                  <td className="py-2.5 px-3.5 text-right tabular-nums font-bold whitespace-nowrap">
                    {s.otif != null ? (
                      <span
                        className={
                          s.otif >= 90
                            ? 'text-emerald-600'
                            : s.otif >= 75
                            ? 'text-amber-600'
                            : 'text-rose-600'
                        }
                      >
                        {s.otif}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 text-right tabular-nums font-bold whitespace-nowrap">
                    {s.q != null ? (
                      <span
                        className={
                          s.q >= 98
                            ? 'text-emerald-600'
                            : s.q >= 90
                            ? 'text-amber-600'
                            : 'text-rose-600'
                        }
                      >
                        {s.q}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                    {Number(s.qty_received ?? 0).toLocaleString('en-IN')}
                  </td>
                  <td
                    className={`py-2.5 px-3.5 text-right tabular-nums font-bold whitespace-nowrap ${
                      Number(s.qty_rejected) > 0 ? 'text-rose-600' : 'text-slate-400'
                    }`}
                  >
                    {Number(s.qty_rejected ?? 0)}
                  </td>
                  <td
                    className={`py-2.5 px-3.5 text-right tabular-nums font-bold whitespace-nowrap ${
                      Number(s.late_open_pos) > 0 ? 'text-rose-600' : 'text-slate-400'
                    }`}
                  >
                    {s.late_open_pos ?? 0}
                  </td>
                  <td className="py-2.5 px-3.5 text-right tabular-nums font-black text-slate-900 whitespace-nowrap">
                    {s.score ?? '—'}
                  </td>
                  <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                    {s.grade !== '—' ? (
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-xl font-black text-xs ${
                          s.grade === 'A'
                            ? 'bg-emerald-100 text-emerald-800'
                            : s.grade === 'B'
                            ? 'bg-indigo-100 text-brand-indigo'
                            : s.grade === 'C'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {s.grade}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
              {loading && (!data || data.length === 0) ? (
                <TableLoadingRow
                  colSpan={9}
                  text="Calculating supplier delivery performance and quality scorecards..."
                />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    No supplier performance data available.
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

