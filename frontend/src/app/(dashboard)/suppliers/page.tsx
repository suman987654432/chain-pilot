'use client';

import React from 'react';
import Link from 'next/link';
import MasterPage from '@/components/MasterPage';
import { StatusBadge, Button } from '@/components/ui';
import { Award } from 'lucide-react';

export default function SuppliersPage() {
  return (
    <MasterPage
      title="Suppliers & Vendors"
      endpoint="/api/suppliers"
      defaults={{ status: 'APPROVED', payment_terms_days: 30 }}
      extra={
        <Link href="/suppliers/performance">
          <Button variant="secondary" className="gap-2 shadow-sm">
            <Award className="w-4 h-4 text-brand-indigo" />
            <span>Supplier Scorecard</span>
          </Button>
        </Link>
      }
      fields={[
        { name: 'code', label: 'Supplier Code', required: true },
        { name: 'name', label: 'Company Name', required: true },
        { name: 'gstin', label: 'GSTIN' },
        { name: 'state_code', label: 'State Code (2 digits)', required: true },
        { name: 'city', label: 'City' },
        { name: 'email', label: 'Procurement Email' },
        { name: 'phone', label: 'Phone Number' },
        {
          name: 'payment_terms_days',
          label: 'Credit Terms (Days)',
          type: 'number',
        },
        {
          name: 'status',
          label: 'Vendor Status',
          type: 'select',
          options: [
            { value: 'APPROVED', label: 'Approved (Normal Purchasing)' },
            {
              value: 'CONDITIONAL',
              label: 'Conditional (Always Requires Approval)',
            },
            { value: 'BLOCKED', label: 'Blocked (PO Creation Forbidden)' },
          ],
        },
      ]}
      columns={[
        {
          key: 'code',
          label: 'Vendor Code',
          render: (r) => <b className="font-mono text-slate-900">{r.code}</b>,
        },
        { key: 'name', label: 'Supplier Name' },
        {
          key: 'gstin',
          label: 'GSTIN',
          render: (r) => (
            <span className="font-mono text-slate-600">
              {r.gstin || 'Unregistered'}
            </span>
          ),
        },
        { key: 'city', label: 'City' },
        {
          key: 'payment_terms_days',
          label: 'Terms',
          num: true,
          render: (r) => `${r.payment_terms_days} d`,
        },
        {
          key: 'lines_due',
          label: 'Historical OTIF',
          num: true,
          render: (r) =>
            Number(r.lines_due)
              ? `${Math.round((100 * r.lines_otif) / r.lines_due)}%`
              : '—',
        },
        {
          key: 'status',
          label: 'Approval Status',
          render: (r) => <StatusBadge s={r.status} />,
        },
      ]}
    />
  );
}

