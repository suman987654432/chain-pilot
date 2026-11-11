'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, todayStr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, PageLoader } from '@/components/ui';
import { ArrowLeft, Printer, CheckCircle, XCircle, PackageCheck, AlertTriangle, RefreshCw } from 'lucide-react';

export default function PODetailPage({ params }: { params: { id: string } }) {
  const { data: p, reload, error, loading } = useData<any>(`/api/pos/${params.id}`);
  const { data: me } = useData<any>('/api/auth/me');

  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [why, setWhy] = useState<any>(null);
  const [grn, setGrn] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !p) {
    return <PageLoader text="Loading purchase order details..." />;
  }

  if (!p) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm font-semibold text-slate-700">Purchase order not found</p>
        <Link href="/procurement/pos" className="text-xs text-brand-indigo font-bold mt-2 inline-block">
          Return to Purchase Orders
        </Link>
      </div>
    );
  }

  const role = me?.role;
  const isBuyer = ['ADMIN', 'MANAGER', 'BUYER'].includes(role);
  const isManager = ['ADMIN', 'MANAGER'].includes(role);
  const isWarehouse = ['ADMIN', 'MANAGER', 'WAREHOUSE'].includes(role);

  const handleAct = async (actionPath: string, body?: any) => {
    setErr('');
    setOk('');
    setBusy(true);
    try {
      const r = await apiCall(`/api/pos/${p.id}/${actionPath}`, 'POST', body);
      setOk(
        actionPath === 'submit'
          ? r.status === 'APPROVED'
            ? 'Released automatically (within buyer ₹1,00,000 limit)'
            : `Submitted for ${r.approval_level} approval`
          : 'Operation completed successfully'
      );
      reload();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePostGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await apiCall('/api/grns', 'POST', {
        po_id: p.id,
        received_on: grn.received_on,
        supplier_invoice: grn.supplier_invoice,
        vehicle_no: grn.vehicle_no,
        lines: Object.entries(grn.lines)
          .filter(([, v]: any) => Number(v.received_qty) > 0)
          .map(([k, v]: any) => ({
            po_line_id: Number(k),
            received_qty: Number(v.received_qty),
            rejected_qty: Number(v.rejected_qty || 0),
            reject_reason: v.reject_reason || null,
          })),
      });
      setGrn(null);
      setOk(`${res.grn_no} posted successfully — PO status: ${res.po_status}`);
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
            href="/procurement/pos"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {p.po_no}
              </h1>
              <StatusBadge s={p.status} />
              {p.approval_level && <StatusBadge s={p.approval_level} />}
              {loading && <LoadingBadge text="Loading..." />}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Created by {p.created_by_name} • Ship to {p.location_code} ({p.location_name})
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => window.print()}
            className="gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Print PO</span>
          </Button>

          {p.status === 'DRAFT' && isBuyer && (
            <>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => handleAct('submit')}
                className="gap-1.5"
              >
                <span>Submit for Approval</span>
              </Button>
              <Button
                variant="danger"
                onClick={() => setWhy({ path: 'cancel', label: 'Cancel PO' })}
              >
                Cancel
              </Button>
            </>
          )}

          {p.status === 'PENDING_APPROVAL' && isManager && (
            <>
              <Button
                variant="success"
                disabled={busy}
                onClick={() => handleAct('approve')}
                className="gap-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Approve PO</span>
              </Button>
              <Button
                variant="danger"
                onClick={() => setWhy({ path: 'reject', label: 'Reject PO' })}
                className="gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject</span>
              </Button>
            </>
          )}

          {['APPROVED', 'PARTIAL'].includes(p.status) && isWarehouse && (
            <Button
              variant="primary"
              onClick={() =>
                setGrn({
                  received_on: todayStr(),
                  supplier_invoice: '',
                  vehicle_no: '',
                  lines: Object.fromEntries(
                    p.lines.map((l: any) => [
                      l.id,
                      {
                        received_qty: Math.max(
                          0,
                          Number(l.qty) - Number(l.accepted_qty)
                        ),
                        rejected_qty: 0,
                        reject_reason: '',
                      },
                    ])
                  ),
                })
              }
              className="gap-2 shadow-sm"
            >
              <PackageCheck className="w-4 h-4" />
              <span>Receive Goods (GRN)</span>
            </Button>
          )}

          {p.status === 'PARTIAL' && isBuyer && (
            <Button
              variant="secondary"
              onClick={() => setWhy({ path: 'close', label: 'Close Short' })}
            >
              Close Short
            </Button>
          )}
        </div>
      </div>

      <div className="no-print">
        <Msg err={err || error} ok={ok} />

        {p.price_flags?.length > 0 && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <b className="block">Approval Price Flags Triggered:</b>
              <span>{p.price_flags.join(' • ')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Printable PO Sheet */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-lg p-8 sm:p-10 max-w-4xl mx-auto space-y-8">
        {/* PO Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-black text-navy-900 tracking-tight">
              PURCHASE ORDER
            </h2>
            <div className="text-base font-bold text-slate-800 mt-1">
              {p.org_name}
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              {p.org_address}
              <br />
              <b>GSTIN:</b> {p.org_gstin}
            </p>
          </div>

          <div className="text-xs space-y-1 sm:text-right">
            <div>
              <span className="text-slate-400">PO Number: </span>
              <b className="font-mono text-sm text-slate-900">{p.po_no}</b>
            </div>
            <div>
              <span className="text-slate-400">PO Date: </span>
              <b className="text-slate-800">{fmtDate(p.po_date)}</b>
            </div>
            <div>
              <span className="text-slate-400">Delivery by: </span>
              <b className="text-brand-indigo font-bold">
                {fmtDate(p.expected_date)}
              </b>
            </div>
            <div>
              <span className="text-slate-400">Credit Terms: </span>
              <b className="text-slate-800">{p.payment_terms_days} Days</b>
            </div>
            {p.rfq_no && (
              <div className="pt-1 text-slate-500">
                Against RFQ: <b className="font-mono">{p.rfq_no}</b>
              </div>
            )}
          </div>
        </div>

        {/* Vendor & Ship-To Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Supplier (Vendor)
            </span>
            <div className="text-sm font-bold text-slate-900">
              {p.supplier} ({p.supplier_code})
            </div>
            <div className="text-slate-600 mt-1">
              {p.supplier_city} • State Code: <b>{p.supplier_state}</b>
            </div>
            <div className="text-slate-600 font-mono mt-0.5">
              <b>GSTIN:</b> {p.supplier_gstin || 'Unregistered'}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Ship to Facility
            </span>
            <div className="text-sm font-bold text-slate-900">
              {p.location_name} ({p.location_code})
            </div>
            <div className="text-slate-600 mt-1">{p.location_city}</div>
            <div className="text-brand-indigo font-bold mt-0.5">
              Tax Regime: {p.tax_type === 'INTRA' ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[800px]">
            <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 whitespace-nowrap">#</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Item Details</th>
                <th className="py-2.5 px-3 whitespace-nowrap">HSN</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">Quantity</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">Unit Rate</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">GST %</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">Taxable Amt</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">Recd</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">Accepted</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">Rejected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {p.lines.map((l: any, i: number) => (
                <tr key={l.id}>
                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">{i + 1}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <b className="font-mono text-slate-900">{l.code}</b>
                      <span className="text-[11px] text-slate-500 truncate max-w-[160px]">
                        {l.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-500">
                    {l.hsn ?? '—'}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                    {Number(l.qty)} {l.uom}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-right tabular-nums text-slate-700">
                    {inr(l.price, 2)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-right tabular-nums text-slate-600">
                    {Number(l.gst_rate)}%
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                    {inr(Number(l.qty) * Number(l.price), 2)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-right tabular-nums text-slate-600">
                    {Number(l.received_qty)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-right tabular-nums font-bold text-emerald-600">
                    {Number(l.accepted_qty)}
                  </td>
                  <td
                    className={`py-2.5 px-3 whitespace-nowrap text-right tabular-nums font-bold ${
                      Number(l.rejected_qty) > 0 ? 'text-rose-600' : 'text-slate-400'
                    }`}
                  >
                    {Number(l.rejected_qty)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* GST Commercial Totals Summary */}
        <div className="flex justify-end pt-4 border-t border-slate-100">
          <div className="w-72 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Taxable Subtotal:</span>
              <span className="tabular-nums font-semibold text-slate-900">
                {inr(p.subtotal, 2)}
              </span>
            </div>
            {Number(p.freight) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Freight Share:</span>
                <span className="tabular-nums font-semibold text-slate-900">
                  {inr(p.freight, 2)}
                </span>
              </div>
            )}
            {p.tax_type === 'INTRA' ? (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>CGST:</span>
                  <span className="tabular-nums font-semibold text-slate-900">
                    {inr(p.cgst, 2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>SGST:</span>
                  <span className="tabular-nums font-semibold text-slate-900">
                    {inr(p.sgst, 2)}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-slate-600">
                <span>IGST:</span>
                <span className="tabular-nums font-semibold text-slate-900">
                  {inr(p.igst, 2)}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black text-slate-900">
              <span>Grand Total:</span>
              <span className="tabular-nums text-brand-indigo font-black text-base">
                {inr(p.total, 2)}
              </span>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-xs">
          <div>
            <span className="text-slate-400 block mb-6">Prepared by</span>
            <b className="text-slate-900 font-bold block">{p.created_by_name}</b>
            <span className="text-slate-500">Procurement Department</span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block mb-6">Authorised Signatory</span>
            <b className="text-slate-900 font-bold block">
              {p.approved_by_name || (p.approval_level === 'AUTO' ? 'System Auto-Released' : 'Pending Authorization')}
            </b>
            <span className="text-slate-500">
              {p.approved_at ? `Approved ${fmtDate(p.approved_at)}` : 'ChainPilot SCM Matrix'}
            </span>
          </div>
        </div>
      </div>

      {/* Associated Goods Receipts (GRN) */}
      {p.grns?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden no-print w-full min-w-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Recorded Goods Receipts (GRN)
            </h3>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">GRN Number</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Receipt Date</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Vendor Invoice</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Vehicle</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Receipt Breakdown</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Storekeeper</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {p.grns.map((g: any) => (
                  <tr key={g.id}>
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-bold text-slate-900">
                      {g.grn_no}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600">
                      {fmtDate(g.received_on)}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold text-slate-800">
                      {g.supplier_invoice}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600">{g.vehicle_no || '—'}</td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                        {g.lines.map((l: any, idx: number) => (
                          <span key={idx} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-50 border border-slate-200">
                            <b className="text-slate-900">{l.code}:</b>
                            <span>{Number(l.received)} recd,</span>
                            <span className="text-emerald-700 font-bold">
                              {Number(l.accepted)} ok
                            </span>
                            {Number(l.rejected) > 0 && (
                              <span className="text-rose-600 font-bold">
                                ({Number(l.rejected)} rej)
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-500">{g.received_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Dialog (Reject / Cancel / Close Short) */}
      {why && (
        <Modal title={why.label} onClose={() => setWhy(null)} maxWidth="max-w-md">
          <div className="space-y-4">
            <Field label="Audit Reason *">
              <textarea
                required
                rows={3}
                placeholder="Specify justification..."
                value={why.reason ?? ''}
                onChange={(e) => setWhy({ ...why, reason: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500"
              />
            </Field>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setWhy(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!why.reason?.trim()}
                onClick={() => {
                  handleAct(why.path, { reason: why.reason });
                  setWhy(null);
                }}
              >
                Confirm {why.label}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Post Goods Receipt (GRN) Dialog */}
      {grn && (
        <Modal
          title={`Post Goods Receipt (GRN) — against ${p.po_no}`}
          onClose={() => setGrn(null)}
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handlePostGRN} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Received on Date *">
                <input
                  type="date"
                  required
                  max={todayStr()}
                  value={grn.received_on}
                  onChange={(e) =>
                    setGrn({ ...grn, received_on: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
                />
              </Field>

              <Field label="Supplier Invoice / Delivery Challan *">
                <input
                  type="text"
                  required
                  placeholder="e.g. APX/551"
                  value={grn.supplier_invoice}
                  onChange={(e) =>
                    setGrn({ ...grn, supplier_invoice: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-bold"
                />
              </Field>

              <Field label="Vehicle Registration Number">
                <input
                  type="text"
                  placeholder="e.g. HR38T4410"
                  value={grn.vehicle_no}
                  onChange={(e) =>
                    setGrn({ ...grn, vehicle_no: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo uppercase font-mono"
                />
              </Field>
            </div>

            <div className="overflow-x-auto w-full border border-slate-100 rounded-xl">
              <table className="w-full text-left text-xs min-w-[550px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Item SKU</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Open Qty</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Received Qty</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Rejected Qty</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Rejection Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {p.lines.map((l: any) => {
                    const lineState = grn.lines[l.id] || {};
                    const openQty =
                      Number(l.qty) - Number(l.accepted_qty);

                    return (
                      <tr key={l.id}>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {l.code}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-600">
                          {openQty}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={lineState.received_qty}
                            onChange={(e) => {
                              setGrn({
                                ...grn,
                                lines: {
                                  ...grn.lines,
                                  [l.id]: {
                                    ...lineState,
                                    received_qty: e.target.value,
                                  },
                                },
                              });
                            }}
                            className="w-24 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={lineState.rejected_qty}
                            onChange={(e) => {
                              setGrn({
                                ...grn,
                                lines: {
                                  ...grn.lines,
                                  [l.id]: {
                                    ...lineState,
                                    rejected_qty: e.target.value,
                                  },
                                },
                              });
                            }}
                            className="w-20 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg font-bold text-rose-600"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            placeholder="Reason if rejected"
                            value={lineState.reject_reason ?? ''}
                            onChange={(e) => {
                              setGrn({
                                ...grn,
                                lines: {
                                  ...grn.lines,
                                  [l.id]: {
                                    ...lineState,
                                    reject_reason: e.target.value,
                                  },
                                },
                              });
                            }}
                            className="w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-500">
              * Up to +5% over-receipt tolerance permitted. Accepted inventory is immediately booked at landed moving-average cost.
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setGrn(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                {busy ? 'Posting Move...' : 'Post Goods Receipt'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

