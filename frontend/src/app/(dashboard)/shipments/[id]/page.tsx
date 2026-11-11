'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, PageLoader } from '@/components/ui';
import { ArrowLeft, Printer, Truck, CheckCircle2, AlertTriangle, MapPin, Phone, RefreshCw } from 'lucide-react';

export default function TripDetailPage({ params }: { params: { id: string } }) {
  const { data: s, reload, error, loading } = useData<any>(`/api/shipments/${params.id}`);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [ewb, setEwb] = useState<string | null>(null);
  const [delivStop, setDelivStop] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !s) {
    return <PageLoader text="Loading shipment trip details..." />;
  }

  if (!s) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm font-semibold text-slate-700">Shipment not found</p>
        <Link href="/shipments" className="text-xs text-brand-indigo font-bold mt-2 inline-block">
          Return to Shipments
        </Link>
      </div>
    );
  }

  const isSalesTrip = s.type === 'SALES';
  const isPlanned = s.status === 'PLANNED';

  const handleAct = async (actionPath: string, body?: any) => {
    setErr('');
    setOk('');
    setBusy(true);
    try {
      await apiCall(`/api/shipments/${s.id}/${actionPath}`, 'POST', body);
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

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await handleAct('dispatch', {
      eway_bill_no: ewb || undefined,
    });
    if (success) setEwb(null);
  };

  const handleConfirmDeliverStop = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await apiCall(
        `/api/shipments/${s.id}/stops/${delivStop.stop.id}/deliver`,
        'POST',
        {
          receiver_name: delivStop.receiver_name,
          remarks: delivStop.remarks,
          lines: Object.entries(delivStop.lines).map(([k, v]: any) => ({
            line_id: Number(k),
            delivered_qty: Number(v.delivered_qty),
            short_reason: v.short_reason || null,
          })),
        }
      );
      setDelivStop(null);
      setOk('Stop delivery confirmed and ledger updated');
      reload();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <Link
            href="/shipments"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {s.shp_no}
              </h1>
              <StatusBadge s={s.type} />
              <StatusBadge s={s.status} />
              {loading && <LoadingBadge text="Loading..." />}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Origin: <b>{s.from_code}</b> ({s.from_name}) • Vehicle:{' '}
              <b>{s.reg_no ?? 'Unassigned'}</b>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => window.print()}
            className="gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Print Delivery Challan</span>
          </Button>

          {isPlanned && isSalesTrip && (
            <>
              <Button
                variant="primary"
                onClick={() => setEwb(s.eway_bill_no ?? '')}
                className="gap-1.5 shadow-sm"
              >
                <Truck className="w-4 h-4" />
                <span>Dispatch Trip</span>
              </Button>
              <Button
                variant="danger"
                onClick={() => handleAct('cancel')}
              >
                Cancel Trip
              </Button>
            </>
          )}

          {s.type === 'TRANSFER' && s.transfer_order_id && (
            <Link href={`/transfers/${s.transfer_order_id}`}>
              <Button variant="secondary">
                View Transfer {s.to_no}
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="no-print">
        <Msg err={err || error} ok={ok} />
      </div>

      {/* Shipment Manifest Header Card */}
      <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Origin Dispatch Facility
          </span>
          <b className="text-slate-900 text-sm block">
            {s.from_code} • {s.from_name}
          </b>
          <span className="text-slate-500">{s.from_city}</span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Vehicle & Transporter
          </span>
          <b className="font-mono text-slate-900 text-sm block">
            {s.reg_no ?? 'Unassigned'}
          </b>
          <span className="text-slate-500">
            {s.transporter || 'Own Fleet'} • Cap: {s.capacity_kg} kg
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Assigned Driver
          </span>
          <b className="text-slate-900 text-sm block">{s.driver ?? 'Unassigned'}</b>
          <span className="text-slate-500">{s.driver_phone || '—'}</span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Consignment Metrics
          </span>
          <b className="text-slate-900 text-sm block">
            {Math.round(Number(s.total_weight))} kg • {inr(s.total_value)}
          </b>
          <div className="text-slate-500 mt-0.5">
            Freight: <b>{inr(s.freight_cost)}</b> • E-Way:{' '}
            <b className="font-mono">{s.eway_bill_no || 'None'}</b>
          </div>
        </div>
      </div>

      {/* Stop by Stop Routing */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Delivery Routing & Proof of Delivery (POD)
        </h3>

        {s.stops.map((st: any) => (
          <div
            key={st.id}
            className={`bg-white rounded-2xl border p-5 space-y-4 shadow-sm transition-all w-full min-w-0 overflow-hidden ${
              st.status === 'DELIVERED'
                ? 'border-emerald-200'
                : st.status === 'PARTIAL'
                ? 'border-amber-200'
                : 'border-slate-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-800 text-xs font-black flex items-center justify-center">
                  {st.seq}
                </span>
                <div>
                  <b className="text-sm text-slate-900">
                    {st.customer || `${st.to_code} • ${st.to_name}`}
                  </b>
                  <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {st.city} {st.address}
                    </span>
                    {st.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {st.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {st.so_no && (
                  <Link
                    href={`/sales/${st.so_id}`}
                    className="font-mono text-xs font-bold text-brand-indigo underline"
                  >
                    SO: {st.so_no}
                  </Link>
                )}
                <StatusBadge s={st.status} />

                {s.status === 'DISPATCHED' && st.status === 'PENDING' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      setDelivStop({
                        stop: st,
                        receiver_name: '',
                        remarks: '',
                        lines: Object.fromEntries(
                          st.lines.map((l: any) => [
                            l.id,
                            {
                              delivered_qty: l.qty,
                              short_reason: '',
                            },
                          ])
                        ),
                      })
                    }
                  >
                    Deliver Stop
                  </Button>
                )}
              </div>
            </div>

            {/* Line items on this stop */}
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[680px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Item SKU</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Item Description</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Shipped Qty</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Delivered Qty</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Shortage Exception</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {st.lines.map((l: any) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-bold text-slate-900">
                        {l.code}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">{l.name}</td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                        {Number(l.qty)} {l.uom}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-emerald-600">
                        {l.delivered_qty != null ? Number(l.delivered_qty) : '—'}
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* POD Details if closed */}
            {st.delivered_at && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600">
                <div>
                  Received by: <b className="text-slate-900">{st.receiver_name}</b> on{' '}
                  {fmtDate(st.delivered_at)}
                  {st.pod_lat && (
                    <span className="ml-2 text-slate-400">
                      (GPS: {Number(st.pod_lat).toFixed(4)}, {Number(st.pod_lng).toFixed(4)})
                    </span>
                  )}
                </div>
                {st.remarks && <div className="text-slate-500 italic">{st.remarks}</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dispatch Modal with E-Way Bill */}
      {ewb !== null && (
        <Modal
          title="Dispatch Delivery Trip"
          onClose={() => setEwb(null)}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleDispatch} className="space-y-4">
            <p className="text-xs text-slate-500">
              Releases order stock reservations, posts inventory decrement moves at moving-average cost, and incorporates quantity into monthly demand history.
            </p>

            <Field
              label={`E-Way Bill Number (12 Digits) ${
                Number(s.total_value) > 50000 ? '(Required > ₹50,000) *' : ''
              }`}
            >
              <input
                type="text"
                maxLength={12}
                placeholder="e.g. 351002884999"
                value={ewb}
                onChange={(e) => setEwb(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-mono font-bold tracking-wider"
              />
            </Field>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setEwb(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={
                  busy || (Number(s.total_value) > 50000 && ewb.trim().length !== 12)
                }
              >
                {busy ? 'Dispatching...' : 'Confirm Dispatch'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirm Deliver Stop Dialog */}
      {delivStop && (
        <Modal
          title={`Deliver Stop — ${delivStop.stop.customer || delivStop.stop.to_code}`}
          onClose={() => setDelivStop(null)}
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleConfirmDeliverStop} className="space-y-4">
            <Field label="Receiver Full Name *">
              <input
                type="text"
                required
                placeholder="Person receiving goods"
                value={delivStop.receiver_name}
                onChange={(e) =>
                  setDelivStop({ ...delivStop, receiver_name: e.target.value })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
              />
            </Field>

            <Field label="Driver Delivery Remarks">
              <input
                type="text"
                placeholder="Delivery notes, gate entry #..."
                value={delivStop.remarks}
                onChange={(e) =>
                  setDelivStop({ ...delivStop, remarks: e.target.value })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Delivered Quantities & Shortage Reasons
              </h4>
              {delivStop.stop.lines.map((l: any) => {
                const lineState = delivStop.lines[l.id] || {};
                const isShort =
                  Number(lineState.delivered_qty) < Number(l.qty);

                return (
                  <div
                    key={l.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <b className="font-mono text-slate-900">{l.code}</b>
                      <span className="text-slate-500 block">
                        Shipped: {Number(l.qty)} {l.uom}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max={Number(l.qty)}
                        value={lineState.delivered_qty}
                        onChange={(e) =>
                          setDelivStop({
                            ...delivStop,
                            lines: {
                              ...delivStop.lines,
                              [l.id]: {
                                ...lineState,
                                delivered_qty: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-24 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
                      />

                      {isShort && (
                        <select
                          required
                          value={lineState.short_reason ?? ''}
                          onChange={(e) =>
                            setDelivStop({
                              ...delivStop,
                              lines: {
                                ...delivStop.lines,
                                [l.id]: {
                                  ...lineState,
                                  short_reason: e.target.value,
                                },
                              },
                            })
                          }
                          className="px-2.5 py-1 text-xs bg-white border border-rose-300 rounded-lg text-rose-700 font-bold"
                        >
                          <option value="">— Reason for Shortage —</option>
                          <option value="REFUSED">Customer Refused (Returns to Stock)</option>
                          <option value="DAMAGED">Damaged in Transit (Loss)</option>
                          <option value="SHORT_LOADED">Short Loaded (Loss)</option>
                          <option value="OTHER">Other</option>
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setDelivStop(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={busy || !delivStop.receiver_name.trim()}
              >
                {busy ? 'Saving POD...' : 'Confirm Delivery'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

