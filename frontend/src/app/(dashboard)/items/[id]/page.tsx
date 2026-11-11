'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, inr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, PageLoader } from '@/components/ui';
import { ArrowLeft, Layers, Edit2, Plus, Sliders, Trash2, RefreshCw } from 'lucide-react';

export default function ItemDetailPage({ params }: { params: { id: string } }) {
  const { data: it, reload, error, loading } = useData<any>(`/api/items/${params.id}`);
  const { data: lk } = useData<any>('/api/lookups');

  const [bom, setBom] = useState<any[] | null>(null);
  const [src, setSrc] = useState<any>(null);
  const [pol, setPol] = useState<any>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !it) {
    return <PageLoader text="Loading item specifications and BOM..." />;
  }

  if (!it) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm font-semibold text-slate-700">Item SKU not found</p>
        <Link href="/items" className="text-xs text-brand-indigo font-bold mt-2 inline-block">
          Return to Item Master
        </Link>
      </div>
    );
  }

  const rolledCost = (it.bom ?? []).reduce(
    (acc: number, b: any) =>
      acc +
      Number(b.qty_per) *
        (1 + Number(b.scrap_pct) / 100) *
        Number(b.avg_cost),
    0
  );

  const handleSaveBOM = async () => {
    setErr('');
    setBusy(true);
    try {
      await apiCall(`/api/items/${it.id}/bom`, 'PUT', {
        lines: bom?.map((b) => ({
          component_id: Number(b.component_id),
          qty_per: Number(b.qty_per),
          scrap_pct: Number(b.scrap_pct || 0),
        })),
      });
      setBom(null);
      setOk('Bill of Materials updated successfully');
      reload();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiCall('/api/sources', 'POST', {
        ...src,
        price: Number(src.price),
        lead_time_days: Number(src.lead_time_days),
        moq: Number(src.moq || 1),
      });
      setSrc(null);
      setOk('Approved source updated');
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiCall('/api/policies', 'PUT', {
        ...pol,
        safety_stock: Number(pol.safety_stock),
      });
      setPol(null);
      setOk('Inventory policy updated');
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/items"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {it.code}
              </h1>
              <span className="text-lg font-bold text-slate-700">{it.name}</span>
              <StatusBadge s={it.make_buy} />
              {loading && <LoadingBadge text="Loading..." />}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Classification: <b className="text-slate-800">{it.type}</b> • UoM: {it.uom} • GST: {it.gst_rate}%
            </p>
          </div>
        </div>
      </div>

      <Msg err={err || error} ok={ok} />

      {/* Item Properties Matrix */}
      <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Lead Time & Sizing
          </span>
          <b className="text-slate-900 text-sm block">
            {it.lead_time_days} Days Lead
          </b>
          <span className="text-slate-500">
            MOQ: {Number(it.moq)} • Lot Multiple: {Number(it.lot_multiple)}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Cost & Valuation
          </span>
          <b className="text-slate-900 text-sm block">
            Moving Avg: {inr(it.avg_cost, 2)}
          </b>
          <span className="text-slate-500">Standard: {inr(it.std_cost, 2)}</span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Commercial & Weight
          </span>
          <b className="text-slate-900 text-sm block">
            Sale: {inr(it.sale_price)}
          </b>
          <span className="text-slate-500">Unit Weight: {it.weight_kg} kg</span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Target Service Level
          </span>
          <b className="text-brand-indigo text-base font-black block">
            {Number(it.service_level)}%
          </b>
          <span className="text-slate-400">Statistical safety factor</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full min-w-0">
        {/* Bill of Materials (If MAKE) or Approved Sources (If BUY) */}
        {it.make_buy === 'MAKE' ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-5 space-y-4 w-full min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                Bill of Materials (BOM)
              </h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setBom(
                    (it.bom ?? []).map((b: any) => ({
                      component_id: b.component_id,
                      qty_per: Number(b.qty_per),
                      scrap_pct: Number(b.scrap_pct),
                    }))
                  )
                }
                className="gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit BOM</span>
              </Button>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[540px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Component SKU</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Qty / Unit</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Scrap %</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Landed Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {it.bom?.map((b: any) => (
                    <tr key={b.id}>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/items/${b.component_id}`}
                            className="font-mono font-bold text-brand-indigo hover:underline"
                          >
                            {b.code}
                          </Link>
                          <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                            {b.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                        {Number(b.qty_per)} {b.uom}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-500">
                        {Number(b.scrap_pct)}%
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-semibold text-slate-800">
                        {inr(
                          Number(b.qty_per) *
                            (1 + Number(b.scrap_pct) / 100) *
                            Number(b.avg_cost),
                          2
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/70 font-black text-slate-900">
                    <td colSpan={3} className="py-2.5 px-3.5 whitespace-nowrap text-right">
                      Rolled-Up Material Cost:
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-brand-indigo text-sm">
                      {inr(rolledCost, 2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-5 space-y-4 w-full min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                Approved Supplier Sources
              </h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setSrc({
                    item_id: it.id,
                    preferred: (it.sources ?? []).length === 0,
                    lead_time_days: it.lead_time_days,
                    moq: Number(it.moq),
                  })
                }
                className="gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Source</span>
              </Button>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[560px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Supplier Name</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Contract Price</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Lead (Days)</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap text-right">MOQ</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {it.sources?.map((s: any) => (
                    <tr key={s.supplier_id}>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">
                            {s.name}
                          </span>
                          {s.preferred && (
                            <span className="badge-status s-HEALTHY text-[9px] px-1.5 py-0">
                              Preferred ★
                            </span>
                          )}
                          <StatusBadge s={s.status} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                        {inr(s.price, 2)}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-600">
                        {s.lead_time_days} d
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-600">
                        {Number(s.moq)}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-right">
                        <button
                          onClick={() =>
                            setSrc({
                              ...s,
                              item_id: it.id,
                              price: Number(s.price),
                              moq: Number(s.moq),
                            })
                          }
                          className="text-xs text-brand-indigo font-bold hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(it.sources ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No approved vendor sources listed.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stocking Points & Inventory Policy */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-5 space-y-4 w-full min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Stocking Points & Policy Parameters
            </h3>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs min-w-[620px]">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Facility</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap text-right">On Hand</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Reserved</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Safety Stock</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap text-right">ROP</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Class</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Policy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {it.stock?.map((s: any) => (
                  <tr key={s.location_id}>
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold text-slate-900">
                      {s.code}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                      {Number(s.on_hand)}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-500">
                      {Number(s.reserved)}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-semibold text-slate-900">
                      {Number(s.safety_stock)}
                      {s.fixed_ss && (
                        <span className="ml-1 text-[9px] font-bold text-amber-700 bg-amber-50 px-1 py-0 rounded border border-amber-200">
                          Fixed
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-600">
                      {Number(s.reorder_point)}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      {s.abc && (
                        <div className="flex items-center gap-1">
                          <span className={`badge-status s-${s.abc} px-1.5 text-[9px]`}>
                            {s.abc}
                          </span>
                          <span className={`badge-status s-${s.xyz} px-1.5 text-[9px]`}>
                            {s.xyz}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right">
                      <button
                        onClick={() =>
                          setPol({
                            item_id: it.id,
                            location_id: s.location_id,
                            code: s.code,
                            safety_stock: Number(s.safety_stock),
                            fixed_ss: s.fixed_ss,
                          })
                        }
                        className="text-xs text-brand-indigo font-bold hover:underline"
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {it.used_in?.length > 0 && (
            <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center gap-2">
              <span>Where-Used Parent Assemblies:</span>
              {it.used_in.map((u: any) => (
                <Link
                  key={u.id}
                  href={`/items/${u.id}`}
                  className="px-2 py-0.5 rounded bg-indigo-50 text-brand-indigo font-bold border border-indigo-100 hover:underline"
                >
                  {u.code} × {Number(u.qty_per)}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit BOM Modal */}
      {bom && (
        <Modal
          title={`Edit Bill of Materials — ${it.code}`}
          onClose={() => setBom(null)}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Component Parts
              </span>
              <button
                type="button"
                onClick={() =>
                  setBom([...bom, { component_id: '', qty_per: 1, scrap_pct: 0 }])
                }
                className="text-xs font-bold text-brand-indigo hover:underline"
              >
                + Add Component
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {bom.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    required
                    value={b.component_id}
                    onChange={(e) => {
                      const updated = [...bom];
                      updated[i] = {
                        ...b,
                        component_id: Number(e.target.value),
                      };
                      setBom(updated);
                    }}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-indigo font-medium"
                  >
                    <option value="">— Select Component Part —</option>
                    {lk?.items
                      .filter(
                        (x: any) =>
                          x.id !== it.id && x.type !== 'FINISHED'
                      )
                      .map((x: any) => (
                        <option key={x.id} value={x.id}>
                          {x.code} • {x.name}
                        </option>
                      ))}
                  </select>

                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    required
                    placeholder="Qty"
                    value={b.qty_per}
                    onChange={(e) => {
                      const updated = [...bom];
                      updated[i] = { ...b, qty_per: e.target.value };
                      setBom(updated);
                    }}
                    className="w-20 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
                  />

                  <input
                    type="number"
                    step="any"
                    min="0"
                    max="49"
                    placeholder="Scrap %"
                    value={b.scrap_pct}
                    onChange={(e) => {
                      const updated = [...bom];
                      updated[i] = { ...b, scrap_pct: e.target.value };
                      setBom(updated);
                    }}
                    className="w-20 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-600"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setBom(bom.filter((_, j) => j !== i))
                    }
                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-500">
              * Backend algorithm automatically validates against circular Bill of Material dependency cycles.
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setBom(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={handleSaveBOM}
              >
                {busy ? 'Saving...' : 'Save Bill of Materials'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Source Modal */}
      {src && (
        <Modal
          title={`Approved Vendor Source — ${it.code}`}
          onClose={() => setSrc(null)}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSaveSource} className="space-y-4">
            <Field label="Supplier *">
              <select
                required
                value={src.supplier_id ?? ''}
                onChange={(e) =>
                  setSrc({ ...src, supplier_id: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
              >
                <option value="">— Select Vendor —</option>
                {lk?.suppliers.map((s: any) => (
                  <option
                    key={s.id}
                    value={s.id}
                    disabled={s.status === 'BLOCKED'}
                  >
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Contract Price (₹) *">
                <input
                  type="number"
                  step="any"
                  required
                  value={src.price ?? ''}
                  onChange={(e) =>
                    setSrc({ ...src, price: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-bold"
                />
              </Field>

              <Field label="Lead Time (Days) *">
                <input
                  type="number"
                  required
                  value={src.lead_time_days ?? ''}
                  onChange={(e) =>
                    setSrc({ ...src, lead_time_days: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-bold"
                />
              </Field>
            </div>

            <Field label="Minimum Order Quantity (MOQ)">
              <input
                type="number"
                value={src.moq ?? 1}
                onChange={(e) => setSrc({ ...src, moq: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 pt-2">
              <input
                type="checkbox"
                checked={!!src.preferred}
                onChange={(e) =>
                  setSrc({ ...src, preferred: e.target.checked })
                }
                className="w-4 h-4 text-brand-indigo rounded focus:ring-brand-indigo"
              />
              <span>Mark as Preferred SCM Source ★</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setSrc(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Save Source
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Inventory Policy Modal */}
      {pol && (
        <Modal
          title={`Inventory Policy — ${it.code} @ ${pol.code}`}
          onClose={() => setPol(null)}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSavePolicy} className="space-y-4">
            <p className="text-xs text-slate-500">
              By default, safety stock and reorder points are recalculated dynamically by each forecast and MRP engine run. Lock it to establish a fixed strategic buffer.
            </p>

            <Field label="Safety Stock Units *">
              <input
                type="number"
                min="0"
                required
                value={pol.safety_stock}
                onChange={(e) =>
                  setPol({ ...pol, safety_stock: e.target.value })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-bold text-slate-900"
              />
            </Field>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 pt-1">
              <input
                type="checkbox"
                checked={!!pol.fixed_ss}
                onChange={(e) =>
                  setPol({ ...pol, fixed_ss: e.target.checked })
                }
                className="w-4 h-4 text-brand-indigo rounded focus:ring-brand-indigo"
              />
              <span>Fixed Policy (Do not recalculate during planning runs)</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setPol(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Update Policy
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

