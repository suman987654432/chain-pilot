'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, todayStr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, TableLoadingRow } from '@/components/ui';
import { Truck, Plus, AlertCircle, MapPin, RefreshCw } from 'lucide-react';

const n = (v: any) => Number(v ?? 0).toLocaleString('en-IN');

export default function ShipmentsPage() {
  const [st, setSt] = useState('ACTIVE');
  const { data, reload, error, loading } = useData<any[]>(
    `/api/shipments${st ? `?status=${st}` : ''}`
  );
  const { data: lk } = useData<any>('/api/lookups');

  const [plan, setPlan] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: sos } = useData<any[]>(
    plan?.from_location_id
      ? `/api/sos?status=OPEN&location_id=${plan.from_location_id}`
      : null
  );

  const candidates = (sos ?? []).filter(
    (s) => Number(s.allocated) > 0 && !s.planned
  );
  const totalAllocWeight = candidates
    .filter((s) => plan?.so_ids.includes(s.id))
    .reduce((acc, s) => acc + Number(s.alloc_weight ?? 0), 0);

  const selectedVehicle = lk?.vehicles.find(
    (v: any) => v.id === plan?.vehicle_id
  );

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await apiCall('/api/shipments', 'POST', plan);
      setPlan(null);
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
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Delivery Trips & Shipments
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Dispatch consolidation, vehicle weight capacity enforcement, E-Way Bill checks, and driver Proof of Delivery.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={st}
            onChange={(e) => setSt(e.target.value)}
            className="px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
          >
            <option value="ACTIVE">Active (Planned / On Road)</option>
            <option value="">All Trips</option>
            {['DELIVERED', 'PARTIAL', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <Button
            variant="primary"
            onClick={() =>
              setPlan({
                from_location_id: lk?.locations[1]?.id || 2,
                so_ids: [],
                planned_date: todayStr(),
              })
            }
            className="gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Plan Delivery Trip</span>
          </Button>
        </div>
      </div>

      <Msg err={err || error} />

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0 w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[960px]">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Trip Number</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Shipment Type</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Origin Facility</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Destination Route</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Assigned Vehicle</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Driver</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Consignment Weight</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Consignment Value</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Freight Cost</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Stops Completed</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading && (!data || data.length === 0) ? (
                <TableLoadingRow
                  colSpan={11}
                  text="Fetching outbound delivery trips and shipment status..."
                />
              ) : data && data.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 font-medium">
                    No active trips found.
                  </td>
                </tr>
              ) : (
                data?.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <Link
                        href={`/shipments/${s.id}`}
                        className="font-mono font-bold text-brand-indigo hover:underline inline-flex items-center gap-1.5"
                      >
                        <span>{s.shp_no}</span>
                      </Link>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {fmtDate(s.planned_date)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <StatusBadge s={s.type} />
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                        {s.from_code}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap max-w-xs truncate text-slate-700" title={s.route}>
                      {s.type === 'TRANSFER' ? (
                        <span className="font-semibold text-brand-pink font-mono text-[11px]">
                          Transfer → {s.to_code} ({s.to_no})
                        </span>
                      ) : (
                        s.route || 'Direct delivery'
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-semibold text-slate-800">
                      {s.reg_no ?? <span className="text-slate-300">—</span>}
                      {s.transporter && (
                        <div className="text-[10px] text-slate-400 font-normal">
                          {s.transporter}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">{s.driver ?? '—'}</td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-slate-900">
                      {Math.round(Number(s.total_weight))} kg
                      {s.capacity_kg && (
                        <div className="text-[10px] text-slate-400 font-normal">
                          {Math.round(
                            (100 * Number(s.total_weight)) /
                              Number(s.capacity_kg)
                          )}
                          % payload
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-black text-slate-900">
                      {inr(s.total_value)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums text-slate-600 font-mono text-[11px]">
                      {inr(s.freight_cost)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-emerald-600">
                      {s.stops_done}/{s.stops}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <StatusBadge s={s.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan Trip Dialog */}
      {plan && (
        <Modal
          title="Consolidate Delivery Trip"
          onClose={() => setPlan(null)}
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleCreateTrip} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Dispatch Facility *">
                <select
                  required
                  value={plan.from_location_id}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      from_location_id: Number(e.target.value),
                      so_ids: [],
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
                >
                  {lk?.locations && lk.locations.length > 0 ? (
                    lk.locations.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.code} • {l.name}
                      </option>
                    ))
                  ) : (
                    <option value="">Loading locations...</option>
                  )}
                </select>
              </Field>

              <Field label="Fleet Vehicle *">
                <select
                  value={plan.vehicle_id ?? ''}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      vehicle_id: Number(e.target.value) || null,
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
                >
                  <option value="">— Select Fleet Vehicle —</option>
                  {lk?.vehicles && lk.vehicles.length > 0 ? (
                    lk.vehicles.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.reg_no} ({v.type}) • Max {Number(v.capacity_kg)} kg
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>No vehicles registered in fleet</option>
                  )}
                </select>
              </Field>

              <Field label="Designated Driver">
                <select
                  value={plan.driver_id ?? ''}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      driver_id: Number(e.target.value) || null,
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
                >
                  <option value="">— Select Driver —</option>
                  {lk?.users?.filter((u: any) => u.role === 'DRIVER')?.length > 0 ? (
                    lk.users
                      .filter((u: any) => u.role === 'DRIVER')
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))
                  ) : (
                    <option value="" disabled>No drivers registered in team</option>
                  )}
                </select>
              </Field>
            </div>

            {/* Candidate Orders List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Orders With Allocated Stock (Tick to include stop)
                </h4>
                <div className="text-xs font-bold">
                  Consignment Load:{' '}
                  <span
                    className={
                      selectedVehicle &&
                      totalAllocWeight > Number(selectedVehicle.capacity_kg)
                        ? 'text-rose-600 font-black'
                        : 'text-slate-900'
                    }
                  >
                    {Math.round(totalAllocWeight)} kg
                  </span>{' '}
                  {selectedVehicle && (
                    <span className="text-slate-400 font-normal">
                      (Cap: {Number(selectedVehicle.capacity_kg)} kg)
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                {candidates.map((s) => {
                  const isChecked = plan.so_ids.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer ${
                        isChecked
                          ? 'bg-indigo-50 border border-indigo-200 text-brand-indigo font-semibold'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...plan.so_ids, s.id]
                              : plan.so_ids.filter((x: number) => x !== s.id);
                            setPlan({ ...plan, so_ids: ids });
                          }}
                          className="w-4 h-4 text-brand-indigo rounded"
                        />
                        <span className="font-mono font-bold">{s.so_no}</span>
                        <span>
                          {s.customer} • {s.city}
                        </span>
                      </div>
                      <div className="text-right">
                        <b>{Number(s.allocated)} units</b> •{' '}
                        <span>{Math.round(Number(s.alloc_weight))} kg</span>
                      </div>
                    </label>
                  );
                })}
                {candidates.length === 0 && (
                  <p className="text-center py-6 text-slate-400 text-xs">
                    No orders waiting with allocated stock at this location. Allocate stock on Sales Orders first.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setPlan(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={
                  busy ||
                  plan.so_ids.length === 0 ||
                  (selectedVehicle &&
                    totalAllocWeight > Number(selectedVehicle.capacity_kg))
                }
              >
                Create Delivery Trip
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

