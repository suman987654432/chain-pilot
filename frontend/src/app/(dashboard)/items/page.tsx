'use client';

import React from 'react';
import Link from 'next/link';
import MasterPage from '@/components/MasterPage';
import { StatusBadge } from '@/components/ui';
import { inr } from '@/lib/client';

export default function ItemsPage() {
  return (
    <MasterPage
      title="Items & Catalogue"
      endpoint="/api/items"
      defaults={{
        uom: 'NOS',
        type: 'COMPONENT',
        make_buy: 'BUY',
        gst_rate: 18,
        lead_time_days: 7,
        moq: 1,
        lot_multiple: 1,
        std_cost: 0,
        service_level: 95,
        active: true,
      }}
      fields={[
        { name: 'code', label: 'Item SKU Code', required: true },
        { name: 'name', label: 'Item Description', required: true },
        {
          name: 'type',
          label: 'Item Type',
          type: 'select',
          options: [
            { value: 'FINISHED', label: 'Finished Good' },
            { value: 'TRADED', label: 'Traded Good' },
            { value: 'COMPONENT', label: 'Component Part' },
            { value: 'RAW', label: 'Raw Material' },
            { value: 'PACKING', label: 'Packaging' },
          ],
        },
        {
          name: 'make_buy',
          label: 'Supply Source',
          type: 'select',
          options: [
            { value: 'MAKE', label: 'Make in-house' },
            { value: 'BUY', label: 'Buy from supplier' },
          ],
        },
        { name: 'uom', label: 'Unit of Measure (UoM)' },
        { name: 'hsn', label: 'HSN Code' },
        {
          name: 'gst_rate',
          label: 'GST Rate %',
          type: 'select',
          options: [0, 5, 12, 18, 28, 40].map((v) => ({
            value: v,
            label: `${v}%`,
          })),
        },
        { name: 'lead_time_days', label: 'Lead Time (Days)', type: 'number' },
        { name: 'moq', label: 'Minimum Order Qty (MOQ)', type: 'number' },
        { name: 'lot_multiple', label: 'Order Lot Multiple', type: 'number' },
        { name: 'std_cost', label: 'Standard Cost (₹)', type: 'number' },
        { name: 'sale_price', label: 'Sale Price (₹)', type: 'number' },
        { name: 'weight_kg', label: 'Unit Weight (kg)', type: 'number' },
        {
          name: 'service_level',
          label: 'Target Service Level %',
          type: 'number',
        },
        { name: 'active', label: 'Active in System', type: 'checkbox' },
      ]}
      columns={[
        {
          key: 'code',
          label: 'SKU Code',
          render: (r) => (
            <Link
              href={`/items/${r.id}`}
              className="font-mono font-bold text-brand-indigo hover:underline block"
            >
              {r.code}
            </Link>
          ),
        },
        { key: 'name', label: 'Description' },
        {
          key: 'type',
          label: 'Classification',
          render: (r) => (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {r.type}
            </span>
          ),
        },
        {
          key: 'make_buy',
          label: 'Source',
          render: (r) => <StatusBadge s={r.make_buy} />,
        },
        {
          key: 'lead_time_days',
          label: 'Lead',
          num: true,
          render: (r) => `${r.lead_time_days} d`,
        },
        {
          key: 'moq',
          label: 'MOQ / Mult',
          num: true,
          render: (r) => `${Number(r.moq)} / ${Number(r.lot_multiple)}`,
        },
        {
          key: 'avg_cost',
          label: 'Moving Avg Cost',
          num: true,
          render: (r) => inr(r.avg_cost, 2),
        },
        {
          key: 'service_level',
          label: 'Service Level',
          num: true,
          render: (r) => `${Number(r.service_level)}%`,
        },
        {
          key: 'on_hand',
          label: 'Network Stock',
          num: true,
          render: (r) => Number(r.on_hand).toLocaleString('en-IN'),
        },
        {
          key: 'preferred_supplier',
          label: 'Sourcing / BOM',
          render: (r) =>
            r.make_buy === 'MAKE' ? (
              <span className="font-semibold text-teal-700">
                {r.bom_lines} BOM lines
              </span>
            ) : r.preferred_supplier ? (
              <span className="font-medium text-slate-700">
                {r.preferred_supplier}
              </span>
            ) : (
              <span className="text-rose-600 font-bold text-xs">No Source</span>
            ),
        },
      ]}
    />
  );
}

