'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, todayStr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, TableLoadingRow } from '@/components/ui';
import { FileText, Plus, Trash2, RefreshCw } from 'lucide-react';

export default function PRsPage() {
  const [st, setSt] = useState('OPEN');
  const { data, reload, error, loading } = useData<any[]>(
    `/api/prs${st ? `?status=${st}` : ''}`
  );
  const { data: lk } = useData<any>('/api/lookups');

  const [f, setF] = useState<any>(null);
  const [err, setErr] = useState('');

  const handleCreatePR = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await apiCall('/api/prs', 'POST', {
        ...f,
        lines: f.lines.map((l: any) => ({
          ...l,
          qty: Number(l.qty),
        })),
      });
      setF(null);
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Purchase Requisitions
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Generated automatically by MRP supply runs or manually raised by plant/warehouse stores.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={st}
            onChange={(e) => setSt(e.target.value)}
            className="px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
          >
            <option value="OPEN">Open (Submitted / Approved / RFQ)</option>
            <option value="">All Requisitions</option>
            {['SUBMITTED', 'APPROVED', 'RFQ', 'ORDERED', 'REJECTED'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <Button
            variant="primary"
            onClick={() =>
              setF({
                location_id: 1,
                need_date: todayStr(),
                lines: [{ item_id: '', qty: '' }],
              })
            }
            className="gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Requisition</span>
          </Button>
        </div>
      </div>

      <Msg err={err || error} />

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden w-full min-w-0">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[920px]">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">PR Number</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Date Raised</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Origin Source</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Facility</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Requested Line Items</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Est. Value</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Need Date</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Requested By</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Approved By</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {data?.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <Link
                      href={`/procurement/prs/${p.id}`}
                      className="font-mono font-bold text-brand-indigo hover:underline"
                    >
                      {p.pr_no}
                    </Link>
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600">
                    {fmtDate(p.created_at)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      {p.source}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold text-slate-800">
                    {p.location_code}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap max-w-[240px] truncate text-slate-600">
                    {p.items}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                    {inr(p.est_value)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700 font-medium">
                    {fmtDate(p.need_date)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-500">{p.requested_by_name}</td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-500">
                    {p.approved_by_name ?? '—'}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <StatusBadge s={p.status} />
                  </td>
                </tr>
              ))}
              {loading && (!data || data.length === 0) ? (
                <TableLoadingRow
                  colSpan={10}
                  text="Fetching purchase requisitions from supply chain..."
                />
              ) : data && data.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                    No requisitions found matching this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* New PR Dialog */}
      {f && (
        <Modal
          title="Create Purchase Requisition"
          onClose={() => setF(null)}
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleCreatePR} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Deliver to Location *">
                <select
                  required
                  value={f.location_id}
                  onChange={(e) =>
                    setF({ ...f, location_id: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
                >
                  {lk?.locations.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.code} • {l.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Need by Date *">
                <input
                  type="date"
                  required
                  value={f.need_date}
                  onChange={(e) => setF({ ...f, need_date: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
                />
              </Field>
            </div>

            <Field label="Remarks / Purpose">
              <input
                type="text"
                placeholder="Operational buffer, plant repair, seasonal stock build..."
                value={f.remarks ?? ''}
                onChange={(e) => setF({ ...f, remarks: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Requisition Lines
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    setF({
                      ...f,
                      lines: [...f.lines, { item_id: '', qty: '' }],
                    })
                  }
                  className="text-xs font-bold text-brand-indigo hover:underline"
                >
                  + Add Item
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {f.lines.map((line: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      required
                      value={line.item_id}
                      onChange={(e) => {
                        const ls = [...f.lines];
                        ls[idx] = { ...line, item_id: Number(e.target.value) };
                        setF({ ...f, lines: ls });
                      }}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-indigo"
                    >
                      <option value="">— Select Buyable Item —</option>
                      {lk?.items
                        .filter((i: any) => i.make_buy === 'BUY')
                        .map((i: any) => (
                          <option key={i.id} value={i.id}>
                            {i.code} • {i.name}
                          </option>
                        ))}
                    </select>

                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="Qty"
                      value={line.qty}
                      onChange={(e) => {
                        const ls = [...f.lines];
                        ls[idx] = { ...line, qty: e.target.value };
                        setF({ ...f, lines: ls });
                      }}
                      className="w-24 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-indigo font-bold text-slate-900"
                    />

                    {f.lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setF({
                            ...f,
                            lines: f.lines.filter((_: any, j: number) => j !== idx),
                          })
                        }
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setF(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Submit Requisition
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

