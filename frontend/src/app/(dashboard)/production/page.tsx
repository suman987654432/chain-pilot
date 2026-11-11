'use client';

import React, { useState } from 'react';
import { apiCall, fmtDate, todayStr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, TableLoadingRow } from '@/components/ui';
import { Factory, Play, CheckCircle, XCircle, AlertTriangle, PackageCheck, RefreshCw } from 'lucide-react';

const n = (v: any) => Number(v ?? 0).toLocaleString('en-IN');

export default function ProductionPage() {
  const [st, setSt] = useState('OPEN');
  const { data, reload, error, loading } = useData<any[]>(
    `/api/mos${st ? `?status=${st}` : ''}`
  );
  const { data: lk } = useData<any>('/api/lookups');

  const [sel, setSel] = useState<any>(null);
  const [f, setF] = useState<any>(null);
  const [qty, setQty] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const { data: mo, reload: rm, loading: moLoading } = useData<any>(
    sel ? `/api/mos/${sel}` : null
  );

  const handleAction = async (actionPath: string, body?: any) => {
    setErr('');
    setOk('');
    try {
      await apiCall(`/api/mos/${sel}/${actionPath}`, 'POST', body);
      setOk('Operation executed successfully');
      rm();
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiCall('/api/mos', 'POST', {
        ...f,
        qty: Number(f.qty),
      });
      setF(null);
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Production & Manufacturing Orders
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            BOM explosion, real-time plant component availability check, and ACID back-flush output reporting.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={st}
            onChange={(e) => setSt(e.target.value)}
            className="px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
          >
            <option value="OPEN">Open (Planned / Released)</option>
            <option value="COMPLETED">Completed</option>
            <option value="">All Orders</option>
          </select>

          <Button
            variant="primary"
            onClick={() =>
              setF({ location_id: 1, due_date: todayStr(), qty: '' })
            }
            className="gap-2 shadow-sm"
          >
            <Factory className="w-4 h-4" />
            <span>New Production Order</span>
          </Button>
        </div>
      </div>

      <Msg err={err || error} ok={ok} />

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0 w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[800px]">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3.5 whitespace-nowrap">MO Number</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Finished Item SKU</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Manufacturing Facility</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Target Qty</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Completed Qty</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Due Date</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Lifecycle Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {data?.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => {
                    setSel(m.id);
                    setQty(
                      String(Number(m.qty) - Number(m.completed_qty))
                    );
                  }}
                  className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-bold text-brand-indigo">
                    {m.mo_no}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                        {m.code}
                      </span>
                      <span className="text-slate-800 font-semibold text-xs truncate max-w-[170px]" title={m.name}>
                        {m.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                      {m.location_code}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-slate-900">
                    {n(m.qty)}
                  </td>
                  <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-semibold text-emerald-600">
                    {n(m.completed_qty)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-[11px]">
                    <span className={m.late ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                      {fmtDate(m.due_date)}
                    </span>
                    {m.late && (
                      <span className="ml-1.5 text-[9px] font-bold text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-200 uppercase">
                        Late
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <StatusBadge s={m.status} />
                  </td>
                </tr>
              ))}
              {loading && (!data || data.length === 0) ? (
                <TableLoadingRow
                  colSpan={7}
                  text="Fetching manufacturing orders and shop floor routing..."
                />
              ) : data && data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    No production orders found matching this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* MO Detail & Execution Modal */}
      {sel && moLoading && !mo && (
        <Modal
          title="Production Order — Loading..."
          onClose={() => setSel(null)}
          maxWidth="max-w-3xl"
        >
          <div className="py-12 flex items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin text-brand-indigo" />
            <span className="text-sm font-semibold">Loading manufacturing order details...</span>
          </div>
        </Modal>
      )}
      {sel && mo && (
        <Modal
          title={`Production Order — ${mo.mo_no}: ${mo.code}`}
          onClose={() => setSel(null)}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl text-xs">
              <div>
                <span className="text-slate-400 block">Item Description</span>
                <b className="text-slate-800">{mo.name}</b>
              </div>
              <div>
                <span className="text-slate-400 block">Target / Completed</span>
                <b className="text-slate-900">
                  {n(mo.qty)} / {n(mo.completed_qty)} {mo.uom}
                </b>
              </div>
              <div>
                <span className="text-slate-400 block">Facility / Due</span>
                <b className="text-slate-800">
                  {mo.location_code} • {fmtDate(mo.due_date)}
                </b>
              </div>
              <div>
                <span className="text-slate-400 block">Current Status</span>
                <StatusBadge s={mo.status} />
              </div>
            </div>

            {/* Component Availability Checking Table */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Component Availability Check (BOM Explosion)
              </h4>
              <div className="overflow-x-auto border border-slate-100 rounded-xl w-full">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3 whitespace-nowrap">Component SKU</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Description</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Per Unit</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Scrap %</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Required (Open)</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Free at Plant</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Shortage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {mo.components.map((c: any) => {
                      const isShort = Number(c.free) < Number(c.required);
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {c.code}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 truncate max-w-[140px] whitespace-nowrap" title={c.name}>
                            {c.name}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-500 whitespace-nowrap">
                            {Number(c.qty_per)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-500 whitespace-nowrap">
                            {Number(c.scrap_pct)}%
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                            {Number(c.required)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right tabular-nums font-black whitespace-nowrap ${
                              isShort ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {Number(c.free)}
                          </td>
                          <td className="py-2.5 px-3">
                            {isShort ? (
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                Short {Number(c.required) - Number(c.free)}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                Covered
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
              <div>
                {['PLANNED', 'RELEASED'].includes(mo.status) &&
                  Number(mo.completed_qty) === 0 && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleAction('cancel')}
                    >
                      Cancel Order
                    </Button>
                  )}
              </div>

              <div className="flex items-center gap-3">
                {mo.status === 'PLANNED' && (
                  <Button
                    variant="primary"
                    onClick={() => handleAction('release')}
                    className="gap-2"
                  >
                    <PackageCheck className="w-4 h-4" />
                    <span>Release Order</span>
                  </Button>
                )}

                {mo.status === 'RELEASED' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max={Number(mo.qty) - Number(mo.completed_qty)}
                      placeholder="Output Qty"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      className="w-28 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-bold text-slate-900"
                    />
                    <Button
                      variant="success"
                      onClick={() =>
                        handleAction('complete', { qty: Number(qty) })
                      }
                      disabled={!Number(qty)}
                      className="gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Report Output (Back-flush)</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* New Order Dialog */}
      {f && (
        <Modal
          title="Create Manufacturing Order"
          onClose={() => setF(null)}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Make Item SKU *">
              <select
                required
                value={f.item_id ?? ''}
                onChange={(e) =>
                  setF({ ...f, item_id: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              >
                <option value="">— Select Finished Good —</option>
                {lk?.items
                  .filter((i: any) => i.make_buy === 'MAKE')
                  .map((i: any) => (
                    <option key={i.id} value={i.id}>
                      {i.code} • {i.name}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Manufacturing Plant *">
              <select
                required
                value={f.location_id}
                onChange={(e) =>
                  setF({ ...f, location_id: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              >
                {lk?.locations
                  .filter((l: any) => l.type === 'PLANT')
                  .map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.code} • {l.name}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Production Quantity *">
              <input
                type="number"
                min="1"
                required
                placeholder="e.g. 500"
                value={f.qty}
                onChange={(e) => setF({ ...f, qty: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <Field label="Target Due Date *">
              <input
                type="date"
                required
                value={f.due_date}
                onChange={(e) => setF({ ...f, due_date: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setF(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Create Order
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

