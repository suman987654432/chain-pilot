'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, PageLoader } from '@/components/ui';
import { ArrowLeft, Award, PlusCircle, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

export default function RFQDetailPage({ params }: { params: { id: string } }) {
  const { data: r, reload, error, loading } = useData<any>(`/api/rfqs/${params.id}`);
  const [q, setQ] = useState<any>(null);
  const [awards, setAwards] = useState<Record<number, number>>({});
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (r?.comparison) {
      setAwards(
        Object.fromEntries(
          r.comparison.map((l: any) => [l.id, l.recommended])
        )
      );
    }
  }, [r]);

  if (loading && !r) {
    return <PageLoader text="Loading RFQ details and vendor quotes..." />;
  }

  if (!r) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm font-semibold text-slate-700">RFQ not found</p>
        <Link href="/procurement/rfqs" className="text-xs text-brand-indigo font-bold mt-2 inline-block">
          Return to RFQs
        </Link>
      </div>
    );
  }

  const isOpen = r.status === 'OPEN';
  const hasOffRecommendation = r.comparison.some(
    (l: any) => awards[l.id] && awards[l.id] !== l.recommended
  );

  const handleSaveQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiCall(`/api/rfqs/${r.id}/quotes`, 'POST', {
        supplier_id: q.supplier_id,
        lines: Object.entries(q.lines).map(([k, v]: any) => ({
          rfq_line_id: Number(k),
          ...v,
          price: Number(v.price),
          freight: Number(v.freight || 0),
          lead_time_days: Number(v.lead_time_days),
          payment_terms_days: Number(v.payment_terms_days || 30),
        })),
      });
      setQ(null);
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  const handleAward = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await apiCall(`/api/rfqs/${r.id}/award`, 'POST', {
        awards: Object.entries(awards).map(([k, v]) => ({
          rfq_line_id: Number(k),
          supplier_id: v,
        })),
        note,
      });
      setOk(`Awarded successfully. Generated PO(s): ${res.purchase_orders.join(', ')}`);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/procurement/rfqs"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {r.rfq_no}
              </h1>
              <StatusBadge s={r.status} />
              {loading && <LoadingBadge text="Loading..." />}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Quotes due by <b className="text-slate-800">{fmtDate(r.due_date)}</b> • Delivery required by <b className="text-slate-800">{fmtDate(r.need_date)}</b>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isOpen && (
            <Button
              variant="primary"
              onClick={() =>
                setQ({
                  supplier_id: r.suppliers[0]?.id,
                  lines: Object.fromEntries(
                    r.comparison.map((l: any) => [
                      l.id,
                      {
                        price: '',
                        lead_time_days: '',
                        freight: 0,
                        payment_terms_days: 30,
                      },
                    ])
                  ),
                })
              }
              className="gap-2 shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Enter Supplier Quote</span>
            </Button>
          )}
        </div>
      </div>

      <Msg err={err || error} ok={ok} />

      {/* Invited Suppliers Metadata */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Invited Suppliers & Performance Scorecards
        </h4>
        <div className="flex flex-wrap gap-2">
          {r.suppliers.map((s: any) => (
            <div
              key={s.id}
              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs flex items-center gap-3"
            >
              <span className="font-bold text-slate-900">{s.name}</span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">
                OTIF: <b className="text-slate-900">{s.otif}%</b>
              </span>
              <span className="text-slate-600">
                Quality: <b className="text-slate-900">{s.quality}%</b>
              </span>
              <StatusBadge s={s.status} />
            </div>
          ))}
        </div>
      </div>

      {/* Comparison Tables per Line Item */}
      <div className="space-y-6">
        {r.comparison.map((l: any) => (
          <div
            key={l.id}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden w-full min-w-0"
          >
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div>
                <b className="text-sm font-bold text-slate-900 font-mono">
                  {l.code}
                </b>{' '}
                <span className="text-xs text-slate-600">— {l.name}</span>
              </div>
              <span className="text-xs font-bold text-slate-900">
                Quantity: {Number(l.qty)} {l.uom}
              </span>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[920px]">
                <thead className="bg-slate-50/90 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    {isOpen && <th className="py-3 px-3.5 w-12 whitespace-nowrap">Award</th>}
                    <th className="py-3 px-3.5 whitespace-nowrap">Supplier</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">Base Price</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">Freight (₹)</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">Landed / Unit</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">Lead (Days)</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Projected ETA</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">Cost (60)</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">Deliv (25)</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">Perf (15)</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">Total Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {l.quotes.map((qItem: any) => {
                    const isRec = qItem.supplier_id === l.recommended;
                    const isLowest = qItem.supplier_id === l.lowest;
                    const isSelected = awards[l.id] === qItem.supplier_id;

                    return (
                      <tr
                        key={qItem.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-indigo-50/40' : 'hover:bg-slate-50/50'
                        }`}
                      >
                        {isOpen && (
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <input
                              type="radio"
                              name={`award_${l.id}`}
                              checked={isSelected}
                              onChange={() =>
                                setAwards({
                                  ...awards,
                                  [l.id]: qItem.supplier_id,
                                })
                              }
                              className="w-4 h-4 text-brand-indigo"
                            />
                          </td>
                        )}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {r.suppliers.find((s: any) => s.id === qItem.supplier_id)?.name}
                            </span>
                            {isRec && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap">
                                Best Score
                              </span>
                            )}
                            {isLowest && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 whitespace-nowrap">
                                Lowest Price
                              </span>
                            )}
                            {qItem.awarded && <StatusBadge s="AWARDED" />}
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-700">
                          {inr(qItem.price, 2)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-500">
                          {inr(qItem.freight)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-bold text-slate-900">
                          {inr(qItem.landed, 2)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-600">
                          {qItem.lead_time_days} d
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span
                            className={
                              qItem.days_late > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'
                            }
                          >
                            {fmtDate(qItem.eta)}
                            {qItem.days_late > 0 && ` (+${qItem.days_late}d late)`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-600">
                          {qItem.score_cost}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-600">
                          {qItem.score_delivery}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums text-slate-600">
                          {qItem.score_perf}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right tabular-nums font-black text-slate-900 text-sm">
                          {qItem.score}
                        </td>
                      </tr>
                    );
                  })}
                  {l.quotes.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400">
                        No quotes submitted for this line yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Award Decision Bar */}
      {isOpen && r.comparison.every((l: any) => l.quotes.length > 0) && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-brand-indigo" />
            <h3 className="text-base font-bold text-slate-900">
              Confirm Quotation Award
            </h3>
          </div>

          {hasOffRecommendation && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <span>
                You have selected a vendor that does not hold the highest algorithm score. A mandatory audit justification is required.
              </span>
            </div>
          )}

          <Field
            label={`Award Justification / Commercial Notes ${
              hasOffRecommendation ? '(Mandatory ≥10 chars) *' : ''
            }`}
          >
            <input
              type="text"
              placeholder="e.g. Existing tooling, credit terms, single-source risk mitigation..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
            />
          </Field>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <Button
              variant="primary"
              disabled={
                busy || (hasOffRecommendation && note.trim().length < 10)
              }
              onClick={handleAward}
              className="gap-2 shadow-md"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{busy ? 'Awarding & Generating PO...' : 'Award & Create Purchase Orders'}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Enter Quote Dialog */}
      {q && (
        <Modal
          title="Record Supplier Quotation"
          onClose={() => setQ(null)}
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleSaveQuote} className="space-y-4">
            <Field label="Supplier *">
              <select
                required
                value={q.supplier_id}
                onChange={(e) =>
                  setQ({ ...q, supplier_id: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-semibold text-slate-900"
              >
                {r.suppliers.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Line Commercial Terms
              </h4>
              {r.comparison.map((l: any) => {
                const lineData = q.lines[l.id] || {};
                return (
                  <div
                    key={l.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2"
                  >
                    <div className="text-xs font-bold text-slate-800">
                      {l.code} ({Number(l.qty)} {l.uom})
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                          Unit Price (₹) *
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          placeholder="Rate"
                          value={lineData.price ?? ''}
                          onChange={(e) =>
                            setQ({
                              ...q,
                              lines: {
                                ...q.lines,
                                [l.id]: {
                                  ...lineData,
                                  price: e.target.value,
                                },
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-indigo font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                          Lead Time (Days) *
                        </label>
                        <input
                          type="number"
                          required
                          placeholder="Days"
                          value={lineData.lead_time_days ?? ''}
                          onChange={(e) =>
                            setQ({
                              ...q,
                              lines: {
                                ...q.lines,
                                [l.id]: {
                                  ...lineData,
                                  lead_time_days: e.target.value,
                                },
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-indigo font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                          Freight Share (₹)
                        </label>
                        <input
                          type="number"
                          placeholder="₹"
                          value={lineData.freight ?? 0}
                          onChange={(e) =>
                            setQ({
                              ...q,
                              lines: {
                                ...q.lines,
                                [l.id]: {
                                  ...lineData,
                                  freight: e.target.value,
                                },
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-indigo font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                          Payment Terms
                        </label>
                        <input
                          type="number"
                          placeholder="30 days"
                          value={lineData.payment_terms_days ?? 30}
                          onChange={(e) =>
                            setQ({
                              ...q,
                              lines: {
                                ...q.lines,
                                [l.id]: {
                                  ...lineData,
                                  payment_terms_days: e.target.value,
                                },
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-indigo font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setQ(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Submit Quote
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

