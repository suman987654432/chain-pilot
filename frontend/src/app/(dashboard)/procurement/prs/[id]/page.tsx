'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiCall, fmtDate, inr, todayStr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, PageLoader } from '@/components/ui';
import { ArrowLeft, CheckCircle2, XCircle, ShoppingBag, Send, RefreshCw } from 'lucide-react';

export default function PRDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: p, reload, error, loading } = useData<any>(`/api/prs/${params.id}`);
  const { data: me } = useData<any>('/api/auth/me');
  const { data: lk } = useData<any>('/api/lookups');

  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [rfq, setRfq] = useState<any>(null);
  const [rej, setRej] = useState<string | null>(null);

  if (loading && !p) {
    return <PageLoader text="Loading purchase requisition details..." />;
  }

  if (!p) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm font-semibold text-slate-700">Purchase requisition not found</p>
        <Link href="/procurement/prs" className="text-xs text-brand-indigo font-bold mt-2 inline-block">
          Return to Purchase Requisitions
        </Link>
      </div>
    );
  }

  const role = me?.role;
  const isApprover = ['ADMIN', 'MANAGER'].includes(role);
  const isBuyer = ['ADMIN', 'MANAGER', 'BUYER'].includes(role);

  const handleAct = async (path: string, body?: any) => {
    setErr('');
    setOk('');
    try {
      await apiCall(`/api/prs/${p.id}/${path}`, 'POST', body);
      setOk('Operation executed successfully');
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  const handleOrderDirect = async () => {
    setErr('');
    try {
      const by: Record<number, any[]> = {};
      for (const l of p.lines) {
        const s =
          l.sources?.find((x: any) => x.preferred) ?? l.sources?.[0];
        if (!s) throw new Error(`${l.code} has no approved source listed`);
        (by[s.supplier_id] ??= []).push({
          item_id: l.item_id,
          qty: Number(l.qty),
          price: Number(s.price),
        });
      }

      const made: string[] = [];
      for (const [sid, lines] of Object.entries(by)) {
        const po = await apiCall('/api/pos', 'POST', {
          supplier_id: Number(sid),
          location_id: p.location_id,
          pr_id: p.id,
          expected_date:
            p.need_date > todayStr() ? p.need_date : todayStr(),
          lines,
        });
        made.push(po.po_no);
      }
      setOk(`Created Purchase Orders: ${made.join(', ')} (Draft — Submit for Approval)`);
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  const handleCreateRFQ = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const r = await apiCall('/api/rfqs', 'POST', {
        pr_id: p.id,
        ...rfq,
      });
      router.push(`/procurement/rfqs/${r.id}`);
    } catch (x: any) {
      setErr(x.message);
    }
  };

  const total = p.lines.reduce(
    (acc: number, l: any) => acc + Number(l.qty) * Number(l.est_price),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/procurement/prs"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {p.pr_no}
              </h1>
              <StatusBadge s={p.status} />
              {loading && <LoadingBadge text="Loading..." />}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Raised by {p.requested_by_name} on {fmtDate(p.created_at)}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {isApprover && p.status === 'SUBMITTED' && (
            <>
              <Button
                variant="success"
                onClick={() => handleAct('approve')}
                className="gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Approve Requisition</span>
              </Button>
              <Button
                variant="danger"
                onClick={() => setRej('')}
                className="gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject</span>
              </Button>
            </>
          )}

          {isBuyer && p.status === 'APPROVED' && (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  setRfq({ due_date: todayStr(), supplier_ids: [] })
                }
                className="gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span>Request Quotes (RFQ)</span>
              </Button>
              <Button
                variant="primary"
                onClick={handleOrderDirect}
                className="gap-1.5 shadow-sm"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Order from Preferred Source</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <Msg err={err || error} ok={ok} />

      {/* PR Metadata Grid */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium">
        <div>
          <span className="text-slate-400 block uppercase tracking-wider text-[10px]">
            Delivery Destination
          </span>
          <b className="text-slate-900 text-sm">
            {p.location_code} • {p.location_name}
          </b>
        </div>
        <div>
          <span className="text-slate-400 block uppercase tracking-wider text-[10px]">
            Required Need Date
          </span>
          <b className="text-slate-900 text-sm">{fmtDate(p.need_date)}</b>
        </div>
        <div>
          <span className="text-slate-400 block uppercase tracking-wider text-[10px]">
            Approval State
          </span>
          <div className="text-slate-800 font-semibold mt-0.5">
            {p.approved_by_name ? (
              <span>
                Approved by <b>{p.approved_by_name}</b> on {fmtDate(p.approved_at)}
              </span>
            ) : p.reject_reason ? (
              <span className="text-rose-600 font-bold">
                Rejected: {p.reject_reason}
              </span>
            ) : (
              <span className="text-amber-600 font-bold">Pending Manager Review</span>
            )}
          </div>
        </div>
        <div>
          <span className="text-slate-400 block uppercase tracking-wider text-[10px]">
            Estimated Total
          </span>
          <b className="text-slate-900 text-base font-black">{inr(total)}</b>
        </div>
      </div>

      {/* Associated Links */}
      {(p.rfq || p.pos?.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs font-semibold">
          {p.rfq && (
            <div className="flex items-center gap-2">
              <span className="text-slate-600">Generated RFQ:</span>
              <Link
                href={`/procurement/rfqs/${p.rfq.id}`}
                className="font-mono text-brand-indigo underline"
              >
                {p.rfq.rfq_no}
              </Link>
              <StatusBadge s={p.rfq.status} />
            </div>
          )}
          {p.pos?.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-slate-600">Purchase Orders:</span>
              {p.pos.map((x: any) => (
                <Link
                  key={x.id}
                  href={`/procurement/pos/${x.id}`}
                  className="font-mono text-brand-indigo underline"
                >
                  {x.po_no} ({x.status})
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lines Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden w-full min-w-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Requisition Items & Approved Vendor Sources
          </h3>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[800px]">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">Item SKU</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Item Name</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Requested Qty</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Est. Unit Price</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Est. Subtotal</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Approved Sources (Price • Lead Time)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {p.lines.map((l: any) => (
                <tr key={l.id} className="hover:bg-slate-50/50">
                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-bold text-slate-900">
                    {l.code}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">{l.name}</td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                    {Number(l.qty)} {l.uom}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-600">
                    {inr(l.est_price, 2)}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-semibold text-slate-900">
                    {inr(Number(l.qty) * Number(l.est_price))}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto">
                      {(l.sources ?? []).map((s: any) => (
                        <span
                          key={s.supplier_id}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] whitespace-nowrap border ${
                            s.preferred
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          <span>{s.name}</span>
                          <b className="text-slate-900">₹{s.price}</b>
                          <span>• {s.lead}d</span>
                          {s.preferred && <span className="text-emerald-600">★</span>}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Dialog */}
      {rej !== null && (
        <Modal
          title="Reject Purchase Requisition"
          onClose={() => setRej(null)}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <Field label="Rejection Justification *">
              <textarea
                required
                rows={3}
                placeholder="Give exact business reason for rejecting requisition..."
                value={rej}
                onChange={(e) => setRej(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500"
              />
            </Field>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setRej(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!rej.trim()}
                onClick={() => {
                  handleAct('reject', { reason: rej });
                  setRej(null);
                }}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Request for Quotation (RFQ) Launcher Dialog */}
      {rfq && (
        <Modal
          title="Launch Competitive RFQ"
          onClose={() => setRfq(null)}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreateRFQ} className="space-y-4">
            <Field label="Quotes Submission Due Date *">
              <input
                type="date"
                required
                value={rfq.due_date}
                onChange={(e) =>
                  setRfq({ ...rfq, due_date: e.target.value })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Invite Suppliers (Minimum 2 Required) *
              </label>
              <div className="space-y-1.5 max-h-56 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                {lk?.suppliers.map((s: any) => {
                  const isBlocked = s.status === 'BLOCKED';
                  const isChecked = rfq.supplier_ids.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer ${
                        isBlocked
                          ? 'opacity-40 cursor-not-allowed'
                          : isChecked
                          ? 'bg-indigo-50 text-brand-indigo font-bold'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={isBlocked}
                          checked={isChecked}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...rfq.supplier_ids, s.id]
                              : rfq.supplier_ids.filter((x: number) => x !== s.id);
                            setRfq({ ...rfq, supplier_ids: ids });
                          }}
                          className="w-4 h-4 text-brand-indigo rounded focus:ring-brand-indigo"
                        />
                        <span>{s.name}</span>
                      </div>
                      <StatusBadge s={s.status} />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setRfq(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={rfq.supplier_ids.length < 2}
              >
                Send RFQ
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

