'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, todayStr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, TableLoadingRow } from '@/components/ui';
import { ShoppingCart, Plus, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';

export default function POsPage() {
  const [st, setSt] = useState('OPEN');
  const { data, reload, error, loading } = useData<any[]>(
    `/api/pos${st ? `?status=${st}` : ''}`
  );
  const { data: lk } = useData<any>('/api/lookups');

  const [f, setF] = useState<any>(null);
  const [err, setErr] = useState('');

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await apiCall('/api/pos', 'POST', {
        ...f,
        freight: Number(f.freight || 0),
        lines: f.lines.map((l: any) => ({
          ...l,
          qty: Number(l.qty),
          price: Number(l.price),
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
              Purchase Orders
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Indian GST-compliant orders with tiered approval matrix (≤₹1L Auto, ≤₹10L Manager, &gt;₹10L Director).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={st}
            onChange={(e) => setSt(e.target.value)}
            className="px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
          >
            <option value="OPEN">Open (Draft, Pending, Approved, Partial)</option>
            <option value="RECEIVABLE">Awaiting Goods Receipt</option>
            <option value="">All Orders</option>
            {[
              'DRAFT',
              'PENDING_APPROVAL',
              'APPROVED',
              'PARTIAL',
              'RECEIVED',
              'CLOSED',
              'REJECTED',
              'CANCELLED',
            ].map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <Button
            variant="primary"
            onClick={() =>
              setF({
                location_id: 1,
                expected_date: todayStr(),
                freight: 0,
                lines: [{ item_id: '', qty: '', price: '' }],
              })
            }
            className="gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Purchase Order</span>
          </Button>
        </div>
      </div>

      <Msg err={err || error} />

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0 w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[860px]">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3.5 whitespace-nowrap">PO Number</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">PO Date</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Supplier</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Destination</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Total (incl. GST)</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Expected Delivery</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Approval Level</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Received %</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {data?.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <Link
                      href={`/procurement/pos/${p.id}`}
                      className="font-mono font-bold text-brand-indigo hover:underline inline-flex items-center gap-1.5"
                    >
                      <span>{p.po_no}</span>
                    </Link>
                    {p.price_flags?.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded font-semibold ml-2">
                        <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                        Price flag
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                    {fmtDate(p.po_date)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold text-slate-900">
                    {p.supplier}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                      {p.location_code}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-black text-slate-900">
                    {inr(p.total)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-[11px]">
                    <span className={p.late ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                      {fmtDate(p.expected_date)}
                    </span>
                    {p.late && (
                      <span className="ml-1.5 text-[9px] font-bold text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-200 uppercase">
                        Late
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    {p.approval_level ? (
                      <StatusBadge s={p.approval_level} />
                    ) : (
                      <span className="text-slate-400 font-mono text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-slate-800">
                    {p.pct_received ?? 0}%
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <StatusBadge s={p.status} />
                  </td>
                </tr>
              ))}
              {loading && (!data || data.length === 0) ? (
                <TableLoadingRow
                  colSpan={9}
                  text="Fetching purchase orders and approval states..."
                />
              ) : data && data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    No purchase orders found matching this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* New PO Dialog */}
      {f && (
        <Modal
          title="Create Direct Purchase Order"
          onClose={() => setF(null)}
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleCreatePO} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Supplier *">
                <select
                  required
                  value={f.supplier_id ?? ''}
                  onChange={(e) =>
                    setF({ ...f, supplier_id: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
                >
                  <option value="">— Select Supplier —</option>
                  {lk?.suppliers.map((s: any) => (
                    <option
                      key={s.id}
                      value={s.id}
                      disabled={s.status === 'BLOCKED'}
                    >
                      {s.name} {s.status !== 'APPROVED' ? `(${s.status})` : ''}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Ship to Location *">
                <select
                  required
                  value={f.location_id}
                  onChange={(e) =>
                    setF({ ...f, location_id: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
                >
                  {lk?.locations.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.code} • {l.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Expected Delivery Date *">
                <input
                  type="date"
                  required
                  value={f.expected_date}
                  onChange={(e) =>
                    setF({ ...f, expected_date: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
                />
              </Field>

              <Field label="Freight Charge (₹)">
                <input
                  type="number"
                  placeholder="0"
                  value={f.freight}
                  onChange={(e) => setF({ ...f, freight: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
                />
              </Field>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  PO Items
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    setF({
                      ...f,
                      lines: [
                        ...f.lines,
                        { item_id: '', qty: '', price: '' },
                      ],
                    })
                  }
                  className="text-xs font-bold text-brand-indigo hover:underline"
                >
                  + Add Line
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {f.lines.map((l: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      required
                      value={l.item_id}
                      onChange={(e) => {
                        const ls = [...f.lines];
                        ls[i] = { ...l, item_id: Number(e.target.value) };
                        setF({ ...f, lines: ls });
                      }}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-indigo"
                    >
                      <option value="">— Select Buyable Item —</option>
                      {lk?.items
                        .filter((x: any) => x.make_buy === 'BUY')
                        .map((x: any) => (
                          <option key={x.id} value={x.id}>
                            {x.code} • {x.name}
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
                        ls[i] = { ...l, qty: e.target.value };
                        setF({ ...f, lines: ls });
                      }}
                      className="w-20 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-bold"
                    />

                    <input
                      type="number"
                      required
                      step="any"
                      placeholder="Price"
                      value={l.price}
                      onChange={(e) => {
                        const ls = [...f.lines];
                        ls[i] = { ...l, price: e.target.value };
                        setF({ ...f, lines: ls });
                      }}
                      className="w-24 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-bold"
                    />

                    {f.lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setF({
                            ...f,
                            lines: f.lines.filter((_: any, j: number) => j !== i),
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
                Create Draft PO
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

