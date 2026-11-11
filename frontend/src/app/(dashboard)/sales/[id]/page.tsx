'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, useData } from '@/lib/client';
import { Button, Msg, StatusBadge, LoadingBadge, PageLoader } from '@/components/ui';
import { ArrowLeft, CheckCircle2, Truck, XCircle, Package, RefreshCw } from 'lucide-react';

export default function SODetailPage({ params }: { params: { id: string } }) {
  const { data: s, reload, error, loading } = useData<any>(`/api/sos/${params.id}`);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !s) {
    return <PageLoader text="Loading sales order details..." />;
  }

  if (!s) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm font-semibold text-slate-700">Sales order not found</p>
        <Link href="/sales" className="text-xs text-brand-indigo font-bold mt-2 inline-block">
          Return to Sales Orders
        </Link>
      </div>
    );
  }

  const handleAct = async (actionPath: string) => {
    setErr('');
    setOk('');
    setBusy(true);
    try {
      const r = await apiCall(`/api/sos/${s.id}/${actionPath}`, 'POST');
      if (actionPath === 'allocate') {
        const msg = r.lines
          ?.map(
            (l: any) =>
              `${l.item}: ${l.allocated} allocated${
                l.short ? ` (${l.short} short)` : ''
              }`
          )
          .join(' • ');
        setOk(msg || 'Stock allocation updated');
      } else {
        setOk('Order cancelled successfully');
      }
      reload();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/sales"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {s.so_no}
              </h1>
              <StatusBadge s={s.status} />
              {loading && <LoadingBadge text="Loading..." />}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer: <b className="text-slate-800">{s.customer}</b> ({s.customer_code}) • Ordered on {fmtDate(s.order_date)}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {['OPEN', 'PARTIAL', 'ALLOCATED'].includes(s.status) && (
            <>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => handleAct('allocate')}
                className="gap-2 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Allocate Free Stock</span>
              </Button>
              <Link href={`/shipments?location_id=${s.location_id}`}>
                <Button variant="secondary" className="gap-2">
                  <Truck className="w-4 h-4" />
                  <span>Plan Delivery Trip</span>
                </Button>
              </Link>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => handleAct('cancel')}
              >
                Cancel Order
              </Button>
            </>
          )}
        </div>
      </div>

      <Msg err={err || error} ok={ok} />

      {/* Customer & Delivery Information */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium">
        <div>
          <span className="text-slate-400 block uppercase tracking-wider text-[10px]">
            Customer Destination
          </span>
          <b className="text-slate-900 text-sm block">{s.customer}</b>
          <span className="text-slate-500">
            {s.city} • {s.phone || 'No phone'}
          </span>
          <div className="text-slate-400 font-mono text-[10px] mt-0.5">
            GSTIN: {s.gstin || 'Unregistered'}
          </div>
        </div>

        <div>
          <span className="text-slate-400 block uppercase tracking-wider text-[10px]">
            Ship From Facility
          </span>
          <b className="text-slate-900 text-sm block">
            {s.location_code} ({s.location_name})
          </b>
        </div>

        <div>
          <span className="text-slate-400 block uppercase tracking-wider text-[10px]">
            Promised Delivery Date
          </span>
          <b className="text-slate-900 text-sm block">
            {fmtDate(s.promised_date)}
          </b>
          {s.customer_po && (
            <span className="text-slate-500">PO: {s.customer_po}</span>
          )}
        </div>

        <div>
          <span className="text-slate-400 block uppercase tracking-wider text-[10px]">
            Order Total Value
          </span>
          <b className="text-slate-900 text-base font-black block">
            {inr(s.total)}
          </b>
          <span className="text-[10px] text-slate-400">Includes applicable GST</span>
        </div>
      </div>

      {/* Order Lines */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden w-full min-w-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Order Items & Reservation Status
          </h3>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[850px]">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">Item SKU</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Item Name</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Ordered Qty</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Unit Price</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Allocated Qty</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Shipped Qty</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Delivered Qty</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Free Stock Now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {s.lines.map((l: any) => (
                <tr key={l.id} className="hover:bg-slate-50/50">
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-bold text-slate-900">
                    {l.code}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">{l.name}</td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                    {Number(l.qty)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-600">
                    {inr(l.price)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-brand-indigo">
                    {Number(l.allocated_qty)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-semibold text-amber-600">
                    {Number(l.shipped_qty)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-emerald-600">
                    {Number(l.delivered_qty)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-500 font-semibold">
                    {Number(l.free)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Associated Shipments */}
      {s.shipments?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Assigned Delivery Shipments & Stops
          </h3>
          <div className="space-y-2">
            {s.shipments.map((x: any) => (
              <div
                key={x.id}
                className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <Link
                    href={`/shipments/${x.id}`}
                    className="font-mono font-bold text-brand-indigo underline"
                  >
                    {x.shp_no}
                  </Link>
                  <StatusBadge s={x.status} />
                  <span className="text-slate-500">
                    Stop status: <b className="text-slate-800">{x.stop_status}</b>
                  </span>
                </div>
                {x.receiver_name && (
                  <span className="text-slate-600">
                    Received by <b className="text-slate-900">{x.receiver_name}</b> on{' '}
                    {fmtDate(x.delivered_at)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

