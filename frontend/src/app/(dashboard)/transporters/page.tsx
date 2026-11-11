'use client';

import React from 'react';
import MasterPage from '@/components/MasterPage';
import { useData } from '@/lib/client';

export default function TransportFleetPage() {
  const { data: tr } = useData<any[]>('/api/transporters');

  return (
    <div className="space-y-8">
      {/* Transporters Section */}
      <MasterPage
        title="Transporters & 3PL Logistics"
        endpoint="/api/transporters"
        defaults={{ rate_per_kg: 0, min_charge: 0 }}
        fields={[
          { name: 'name', label: 'Transporter Name', required: true },
          { name: 'gstin', label: 'Transporter GSTIN' },
          { name: 'phone', label: 'Contact Phone' },
          { name: 'rate_per_kg', label: 'Rate per kg (₹)', type: 'number' },
          {
            name: 'min_charge',
            label: 'Minimum Freight Base Charge (₹)',
            type: 'number',
          },
        ]}
        columns={[
          {
            key: 'name',
            label: 'Transporter Name',
            render: (r) => <b className="text-slate-900">{r.name}</b>,
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
          { key: 'phone', label: 'Phone' },
          {
            key: 'rate_per_kg',
            label: 'Freight Rate (₹ / kg)',
            num: true,
            render: (r) => `₹${Number(r.rate_per_kg).toFixed(2)}`,
          },
          {
            key: 'min_charge',
            label: 'Min Charge',
            num: true,
            render: (r) => `₹${Number(r.min_charge)}`,
          },
        ]}
      />

      {/* Fleet Vehicles Section */}
      <MasterPage
        title="Fleet Vehicles"
        endpoint="/api/vehicles"
        defaults={{ type: 'TRUCK' }}
        fields={[
          {
            name: 'reg_no',
            label: 'Vehicle Registration No.',
            required: true,
          },
          { name: 'type', label: 'Vehicle Type (e.g. 20 ft truck, Tata Ace)' },
          {
            name: 'capacity_kg',
            label: 'Maximum Payload Capacity (kg) *',
            type: 'number',
            required: true,
          },
          {
            name: 'transporter_id',
            label: 'Contracted Transporter / Own Fleet',
            type: 'select',
            options: (tr ?? []).map((t: any) => ({
              value: t.id,
              label: t.name,
            })),
          },
        ]}
        columns={[
          {
            key: 'reg_no',
            label: 'Vehicle Reg Number',
            render: (r) => (
              <b className="font-mono font-bold text-slate-900 block">
                {r.reg_no}
              </b>
            ),
          },
          { key: 'type', label: 'Vehicle Type' },
          {
            key: 'capacity_kg',
            label: 'Max Payload Capacity',
            num: true,
            render: (r) => (
              <span className="font-bold text-slate-900">
                {Number(r.capacity_kg).toLocaleString('en-IN')} kg
              </span>
            ),
          },
          {
            key: 'transporter',
            label: 'Operating Logistics Partner',
            render: (r) => r.transporter || 'Own Fleet',
          },
        ]}
      />
    </div>
  );
}

