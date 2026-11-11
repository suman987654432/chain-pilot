'use client';

import React from 'react';
import MasterPage from '@/components/MasterPage';
import { useData } from '@/lib/client';

export default function CustomersPage() {
  const { data: lk } = useData<any>('/api/lookups');

  return (
    <MasterPage
      title="Customers"
      endpoint="/api/customers"
      defaults={{ channel: 'DISTRIBUTOR' }}
      fields={[
        { name: 'code', label: 'Customer Code', required: true },
        { name: 'name', label: 'Customer Name', required: true },
        { name: 'gstin', label: 'Customer GSTIN' },
        { name: 'state_code', label: 'State Code (2 digits)', required: true },
        { name: 'city', label: 'City' },
        { name: 'address', label: 'Billing / Shipping Address' },
        { name: 'phone', label: 'Contact Phone' },
        {
          name: 'channel',
          label: 'Trade Channel',
          type: 'select',
          options: [
            { value: 'DISTRIBUTOR', label: 'Distributor / Wholesale' },
            { value: 'RETAIL', label: 'Direct Retail' },
            { value: 'E-COMMERCE', label: 'E-Commerce Marketplace' },
            { value: 'INSTITUTIONAL', label: 'Institutional / B2B' },
          ],
        },
        {
          name: 'ship_from',
          label: 'Default Ship-From Facility',
          type: 'select',
          options: (lk?.locations ?? []).map((l: any) => ({
            value: l.id,
            label: `${l.code} • ${l.name}`,
          })),
        },
      ]}
      columns={[
        {
          key: 'code',
          label: 'Customer Code',
          render: (r) => <b className="font-mono text-slate-900">{r.code}</b>,
        },
        { key: 'name', label: 'Customer Name' },
        { key: 'city', label: 'City' },
        {
          key: 'channel',
          label: 'Channel',
          render: (r) => (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {r.channel}
            </span>
          ),
        },
        {
          key: 'gstin',
          label: 'GSTIN',
          render: (r) => (
            <span className="font-mono text-slate-600">
              {r.gstin || 'Unregistered'}
            </span>
          ),
        },
        {
          key: 'ship_from_code',
          label: 'Default Facility',
          render: (r) => (
            <span className="font-semibold text-slate-800">
              {r.ship_from_code || 'Auto-routed'}
            </span>
          ),
        },
      ]}
    />
  );
}

