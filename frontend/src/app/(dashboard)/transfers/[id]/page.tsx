'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, PageLoader } from '@/components/ui';
import { ArrowLeft, ArrowRight, Truck, CheckCircle2, AlertTriangle, PackageCheck, RefreshCw } from 'lucide-react';

export default function TransferDetailPage({ params }: { params: { id: string } }) {
  const { data: t, reload, error, loading } = useData<any>(`/api/transfers/${params.id}`);
  const { data: lk } = useData<any>('/api/lookups');

  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [ship, setShip] = useState<any>(null);
  const [rec, setRec] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !t) {
    return <PageLoader text="Loading stock transfer order details..." />;
  }

  if (!t) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm font-semibold text-slate-700">Transfer order not found</p>
        <Link href="/transfers" className="text-xs text-brand-indigo font-bold mt-2 inline-block">
          Return to Transfers
        </Link>
      </div>
    );
  }

  const kg = t.lines.reduce(
    (a: number, l: any) => a + Number(l.qty) * Number(l.weight_kg),
    0
  );
  const val = t.lines.reduce(
    (a: number, l: any) => a + Number(l.qty) * Number(l.avg_cost),
    0
  );

  const handleAct = async (actionPath: string, body?: any) => {
    setErr('');
    setOk('');
    setBusy(true);
    try {
      await apiCall(`/api/transfers/${t.id}/${actionPath}`, 'POST', body);
      setOk('Operation executed successfully');
      reload();
      return true;
    } catch (x: any) {
      setErr(x.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleShip = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await handleAct('ship', ship);
    if (success) setShip(null);
  };

  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await handleAct('receive', {
      lines: Object.entries(rec).map(([k, v]: any) => ({
        to_line_id: Number(k),
        received_qty: Number(v.received_qty),
        short_reason: v.short_reason || null,
      })),
    });
    if (success) setRec(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/transfers"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {t.to_no}
              </h1>
              <StatusBadge s={t.status} />
              {loading && <LoadingBadge text="Loading..." />}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Lane: <b>{t.from_code}</b> ({t.from_name}) → <b>{t.to_code}</b> ({t.to_name}) • {t.transit_days}d transit
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {t.status === 'DRAFT' && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => handleAct('release')}
              className="gap-2 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Release (Reserve at {t.from_code})</span>
            </Button>
          )}

          {t.status === 'RELEASED' && (
            <Button
              variant="primary"
              onClick={() =>
                setShip({
                  vehicle_id: '',
                  driver_id: '',
                  eway_bill_no: '',
                })
              }
              className="gap-2 shadow-sm"
            >
              <Truck className="w-4 h-4" />
              <span>Ship Transfer</span>
            </Button>
          )}

          {t.status === 'DISPATCHED' && (
            <Button
              variant="success"
              onClick={() =>
                setRec(
                  Object.fromEntries(
                    t.lines.map((l: any) => [
                      l.id,
                      {
                        received_qty: Number(l.shipped_qty),
                        short_reason: '',
                      },
                    ])
                  )
                )
              }
              className="gap-2 shadow-sm"
            >
              <PackageCheck className="w-4 h-4" />
              <span>Receive at {t.to_code}</span>
            </Button>
          )}
        </div>
      </div>

      <Msg err={err || error} ok={ok} />

      {/* Transfer Metrics Card */}
      <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Replenishment Route
          </span>
          <b className="text-slate-900 text-sm block">
            {t.from_code} → {t.to_code}
          </b>
          <span className="text-slate-500">{t.transit_days} Days Expected Transit</span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Target Need Date
          </span>
          <b className="text-slate-900 text-sm block">
            {fmtDate(t.need_date)}
          </b>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Consignment Metrics
          </span>
          <b className="text-slate-900 text-sm block">
            {Math.round(kg)} kg • {inr(val)}
          </b>
          <span className="text-slate-500">Valued at moving-average cost</span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Delivery Shipment
          </span>
          {t.shipment ? (
            <div>
              <Link
                href={`/shipments/${t.shipment.id}`}
                className="font-mono text-brand-indigo font-bold text-sm underline block"
              >
                {t.shipment.shp_no}
              </Link>
              <span className="text-slate-500">
                {t.shipment.reg_no} • {t.shipment.driver || 'Driver'}
              </span>
            </div>
          ) : (
            <span className="text-slate-400">Not Shipped Yet</span>
          )}
        </div>
      </div>

      {/* Line Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden w-full min-w-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Transfer Line Items & Multi-Facility Availability
          </h3>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[850px]">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">Item SKU</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Description</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Target Qty</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Free at Source</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Reserved Qty</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Shipped Qty</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Received Qty</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Transit Shortage Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {t.lines.map((l: any) => {
                const isShortAtSource =
                  t.status === 'DRAFT' &&
                  Number(l.free_at_source) < Number(l.qty);
                const isShortReceived =
                  t.status === 'RECEIVED' &&
                  Number(l.received_qty) < Number(l.shipped_qty);

                return (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-bold text-slate-900">
                      {l.code}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">{l.name}</td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                      {Number(l.qty)}
                    </td>
                    <td
                      className={`py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold ${
                        isShortAtSource ? 'text-rose-600' : 'text-slate-700'
                      }`}
                    >
                      {Number(l.free_at_source)}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-brand-indigo">
                      {Number(l.allocated_qty)}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-semibold text-amber-600">
                      {Number(l.shipped_qty)}
                    </td>
                    <td
                      className={`py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold ${
                        isShortReceived ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {Number(l.received_qty)}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      {l.short_reason ? (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          {l.short_reason}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ship Transfer Dialog */}
      {ship && (
        <Modal
          title={`Ship Transfer — ${t.to_no}`}
          onClose={() => setShip(null)}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleShip} className="space-y-4">
            <Field label="Assign Fleet Vehicle *">
              <select
                required
                value={ship.vehicle_id}
                onChange={(e) =>
                  setShip({ ...ship, vehicle_id: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              >
                <option value="">— Select Vehicle —</option>
                {lk?.vehicles.map((v: any) => {
                  const isTooSmall = Number(v.capacity_kg) < kg;
                  return (
                    <option
                      key={v.id}
                      value={v.id}
                      disabled={isTooSmall}
                    >
                      {v.reg_no} ({v.type}) • Max {Number(v.capacity_kg)} kg{' '}
                      {isTooSmall ? '(Payload Too Small)' : ''}
                    </option>
                  );
                })}
              </select>
            </Field>

            <Field label="Designated Driver">
              <select
                value={ship.driver_id}
                onChange={(e) =>
                  setShip({ ...ship, driver_id: Number(e.target.value) || null })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              >
                <option value="">— Select Driver —</option>
                {lk?.users
                  .filter((u: any) => u.role === 'DRIVER')
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>

            <Field
              label={`E-Way Bill Number ${
                val > 50000 ? '(Required > ₹50,000) *' : ''
              }`}
            >
              <input
                type="text"
                placeholder="12 digit statutory number"
                value={ship.eway_bill_no}
                onChange={(e) =>
                  setShip({
                    ...ship,
                    eway_bill_no: e.target.value.replace(/\D/g, ''),
                  })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-mono"
              />
            </Field>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setShip(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={
                  busy || (val > 50000 && ship.eway_bill_no?.trim().length !== 12)
                }
              >
                {busy ? 'Shipping...' : 'Confirm Shipment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Receive at Destination Dialog */}
      {rec && (
        <Modal
          title={`Receive Inbound Transfer at ${t.to_code}`}
          onClose={() => setRec(null)}
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleReceive} className="space-y-4">
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Confirm Received Quantities (Transit Loss Verification)
              </h4>
              {t.lines.map((l: any) => {
                const lineState = rec[l.id] || {};
                const isShort =
                  Number(lineState.received_qty) < Number(l.shipped_qty);

                return (
                  <div
                    key={l.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <b className="font-mono text-slate-900">{l.code}</b>
                      <span className="text-slate-500 font-semibold">
                        Shipped from {t.from_code}: {Number(l.shipped_qty)} {l.uom}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                          Received Quantity
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={Number(l.shipped_qty)}
                          value={lineState.received_qty}
                          onChange={(e) =>
                            setRec({
                              ...rec,
                              [l.id]: {
                                ...lineState,
                                received_qty: e.target.value,
                              },
                            })
                          }
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
                        />
                      </div>

                      {isShort && (
                        <div className="flex-[2]">
                          <label className="text-[10px] text-rose-600 uppercase font-bold block mb-1">
                            Transit Loss / Shortage Reason *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 3 cartons water damaged in transit"
                            value={lineState.short_reason ?? ''}
                            onChange={(e) =>
                              setRec({
                                ...rec,
                                [l.id]: {
                                  ...lineState,
                                  short_reason: e.target.value,
                                },
                              })
                            }
                            className="w-full px-3 py-1.5 text-xs bg-white border border-rose-300 rounded-lg"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setRec(null)}>
                Cancel
              </Button>
              <Button variant="success" type="submit" disabled={busy}>
                {busy ? 'Receiving...' : 'Confirm Receipt'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

