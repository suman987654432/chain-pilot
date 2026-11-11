'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, todayStr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, TableLoadingRow } from '@/components/ui';
import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react';

const n = (v: any) => Number(v ?? 0).toLocaleString('en-IN');

export default function TransfersPage() {
  const [st, setSt] = useState('OPEN');
  const { data, reload, error, loading } = useData<any[]>(
    `/api/transfers${st ? `?status=${st}` : ''}`
  );
  const { data: lk } = useData<any>('/api/lookups');

  const [f, setF] = useState<any>(null);
  const [err, setErr] = useState('');

  const handleCreateTO = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await apiCall('/api/transfers', 'POST', {
        ...f,
        lines: f.lines.map((l: any) => ({
          item_id: l.item_id,
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
              Inter-Location Transfers
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Plant-to-warehouse and warehouse-to-depot stock replenishment (DRP) with in-transit inventory accounting.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={st}
            onChange={(e) => setSt(e.target.value)}
            className="px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
          >
            <option value="OPEN">Open (Draft / Released / Dispatched)</option>
            <option value="">All Transfers</option>
            {['DRAFT', 'RELEASED', 'DISPATCHED', 'RECEIVED'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <Button
            variant="primary"
            onClick={() =>
              setF({
                from_location_id: 1,
                to_location_id: 2,
                need_date: todayStr(),
                lines: [{ item_id: '', qty: '' }],
              })
            }
            className="gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Transfer Order</span>
          </Button>
        </div>
      </div>

      <Msg err={err || error} />

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0 w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[850px]">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3.5 whitespace-nowrap">TO Number</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Transfer Route</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Line Items</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Transfer Qty</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Shipped</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Received</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Need Date</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Trip Number</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {data?.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <Link
                      href={`/transfers/${t.id}`}
                      className="font-mono font-bold text-brand-indigo hover:underline inline-flex items-center gap-1.5"
                    >
                      <span>{t.to_no}</span>
                    </Link>
                    {t.planned_order_id && (
                      <span className="text-[10px] font-bold text-pink-700 bg-pink-50 px-1.5 py-0.5 rounded border border-pink-200 ml-2 inline-block">
                        DRP Auto
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-[11px] font-bold text-slate-900">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">{t.from_code}</span>
                    <span className="text-slate-400 mx-1.5">→</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">{t.to_code}</span>
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 max-w-xs truncate" title={t.items}>
                    {t.items}
                  </td>
                  <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-slate-900">
                    {n(t.qty)}
                  </td>
                  <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-semibold text-amber-600">
                    {n(t.shipped)}
                  </td>
                  <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-emerald-600">
                    {n(t.received)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-[11px]">
                    <span className={t.late ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                      {fmtDate(t.need_date)}
                    </span>
                    {t.late && (
                      <span className="ml-1.5 text-[9px] font-bold text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-200 uppercase">
                        Late
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-700">
                    {t.shp_no || <span className="text-slate-300 font-mono text-xs">—</span>}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <StatusBadge s={t.status} />
                  </td>
                </tr>
              ))}
              {loading && (!data || data.length === 0) ? (
                <TableLoadingRow
                  colSpan={9}
                  text="Fetching inter-location transfer orders..."
                />
              ) : data && data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    No transfer orders found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* New TO Dialog */}
      {f && (
        <Modal
          title="Create Inter-Location Transfer Order"
          onClose={() => setF(null)}
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleCreateTO} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Origin Location *">
                <select
                  required
                  value={f.from_location_id}
                  onChange={(e) =>
                    setF({ ...f, from_location_id: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
                >
                  {lk?.locations.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.code} • {l.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Destination Location *">
                <select
                  required
                  value={f.to_location_id}
                  onChange={(e) =>
                    setF({ ...f, to_location_id: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
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
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
                />
              </Field>
            </div>

            {/* Transfer Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Transfer Line Items
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
                {f.lines.map((l: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      required
                      value={l.item_id}
                      onChange={(e) => {
                        const ls = [...f.lines];
                        ls[idx] = { ...l, item_id: Number(e.target.value) };
                        setF({ ...f, lines: ls });
                      }}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-indigo font-medium"
                    >
                      <option value="">— Select Transferable SKU —</option>
                      {lk?.items.map((i: any) => (
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
                      value={l.qty}
                      onChange={(e) => {
                        const ls = [...f.lines];
                        ls[idx] = { ...l, qty: e.target.value };
                        setF({ ...f, lines: ls });
                      }}
                      className="w-24 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
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
              <Button
                variant="primary"
                type="submit"
                disabled={f.from_location_id === f.to_location_id}
              >
                Create Transfer Order
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

