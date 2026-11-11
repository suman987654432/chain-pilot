'use client';

import React from 'react';
import MasterPage from '@/components/MasterPage';
import { useData } from '@/lib/client';
import { GitBranch, MapPin } from 'lucide-react';

export default function LocationsPage() {
  const { data: locs, reload } = useData<any[]>('/api/locations');
  const list = locs ?? [];

  const getCode = (id: number) => {
    const parent = list.find((l: any) => l.id === Number(id));
    return parent ? `${parent.code} (${parent.name})` : id ? `Location #${id}` : '—';
  };

  const renderTree = (parentId: number | null = null, depth = 0): any[] => {
    return list
      .filter((l: any) => (l.supply_from ?? null) === parentId)
      .flatMap((l: any) => [
        <div
          key={l.id}
          style={{ paddingLeft: `${depth * 28}px` }}
          className="flex items-center gap-2 py-1.5 text-xs font-semibold text-slate-800"
        >
          {depth > 0 && <span className="text-slate-400 font-mono">└── </span>}
          <span className="font-mono font-bold text-brand-indigo bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
            {l.code}
          </span>
          <span className="text-slate-700">{l.name}</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            {l.type}
          </span>
          {depth > 0 && (
            <span className="text-slate-400 font-normal">
              • {l.transit_days}d transit
            </span>
          )}
        </div>,
        ...renderTree(l.id, depth + 1),
      ]);
  };

  return (
    <div className="space-y-6">
      <MasterPage
        title="Network Locations"
        endpoint="/api/locations"
        defaults={{ type: 'WAREHOUSE', transit_days: 2, active: true }}
        fields={[
          { name: 'code', label: 'Location Code', required: true },
          { name: 'name', label: 'Facility Name', required: true },
          {
            name: 'type',
            label: 'Facility Type',
            type: 'select',
            options: [
              { value: 'PLANT', label: 'Central Manufacturing Plant' },
              { value: 'WAREHOUSE', label: 'Regional Distribution Center' },
              { value: 'DEPOT', label: 'Local Forward Depot' },
            ],
          },
          { name: 'city', label: 'City' },
          { name: 'state_code', label: 'GST State Code (2 digits)', required: true },
          {
            name: 'supply_from',
            label: 'Replenished From (DRP Parent)',
            type: 'select',
            options: list.map((l: any) => ({
              value: l.id,
              label: `${l.code} • ${l.name} (${l.type})`,
            })),
          },
          { name: 'transit_days', label: 'Lead Transit Days', type: 'number' },
          { name: 'active', label: 'Facility Active', type: 'checkbox' },
        ]}
        columns={[
          {
            key: 'code',
            label: 'Code',
            render: (r) => <b className="font-mono text-brand-indigo">{r.code}</b>,
          },
          { key: 'name', label: 'Facility Name' },
          {
            key: 'type',
            label: 'Type',
            render: (r) => (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {r.type}
              </span>
            ),
          },
          { key: 'city', label: 'City' },
          { key: 'state_code', label: 'GST State' },
          {
            key: 'supply_from',
            label: 'Replenished From',
            render: (r) => {
              if (r.supply_from) {
                const parent = list.find((l: any) => l.id === Number(r.supply_from));
                return parent ? (
                  <span className="font-semibold text-slate-800">
                    <span className="font-mono font-bold text-brand-indigo mr-1">{parent.code}</span>
                    <span className="text-slate-600">({parent.name})</span>
                  </span>
                ) : (
                  <span className="font-mono text-slate-600">Location #{r.supply_from}</span>
                );
              }
              return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  {r.type === 'PLANT' ? '🏭 Central Plant (Self-Manufactured)' : 'Direct Supplier (External PO)'}
                </span>
              );
            },
          },
          {
            key: 'transit_days',
            label: 'Transit Lead',
            num: true,
            render: (r) => `${r.transit_days} d`,
          },
        ]}
      />

      {/* DRP Hierarchy Tree */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-brand-indigo" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Multi-Echelon DRP Distribution Hierarchy
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Distribution Requirements Planning nets demand backwards along this chain: Depot pulls from Regional Warehouse, which pulls from Central Plant.
        </p>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
          {list.length > 0 ? (
            renderTree(null)
          ) : (
            <span className="text-xs text-slate-400">Loading network tree...</span>
          )}
        </div>
      </div>
    </div>
  );
}

