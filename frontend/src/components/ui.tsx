'use client';

import React, { ReactNode } from 'react';
import { X, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';

export function LoadingBadge({ text = 'Loading...' }: { text?: string }) {
  return (
    <span className="text-[11px] font-bold text-brand-indigo bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded-md inline-flex items-center gap-1 animate-pulse">
      <RefreshCw className="w-3 h-3 animate-spin text-brand-indigo" />
      <span>{text}</span>
    </span>
  );
}

export function TableLoadingRow({
  colSpan,
  text = 'Fetching real-time data from network...',
}: {
  colSpan: number;
  text?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center text-slate-400 font-medium">
        <div className="flex items-center justify-center gap-2 text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin text-brand-indigo" />
          <span>{text}</span>
        </div>
      </td>
    </tr>
  );
}

export function PageLoader({ text = 'Loading details...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
      <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-indigo shadow-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-brand-indigo" />
      </div>
      <div className="text-center">
        <p className="text-xs font-bold text-slate-700">{text}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Fetching latest state from database</p>
      </div>
    </div>
  );
}

export function Badge({
  s,
  text,
  className = '',
}: {
  s: string;
  text?: string;
  className?: string;
}) {
  const display = text || s.replace(/_/g, ' ');
  return (
    <span className={`badge-status s-${s} ${className}`}>
      {display}
    </span>
  );
}

export function StatusBadge({ s }: { s?: string | null }) {
  if (!s) return null;
  return <Badge s={s} />;
}

export function Modal({
  title,
  onClose,
  children,
  maxWidth = 'max-w-2xl',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`relative w-full ${maxWidth} bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 max-h-[82vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  wide = false,
  error,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  error?: string;
}) {
  return (
    <div className={`space-y-1.5 ${wide ? 'col-span-full' : ''}`}>
      <label className="block text-xs font-semibold text-slate-600 tracking-wide uppercase">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
    </div>
  );
}

export function Msg({
  err,
  ok,
  warn,
}: {
  err?: string | null;
  ok?: string | null;
  warn?: string | null;
}) {
  if (err) {
    return (
      <div className="mb-4 flex items-start gap-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
        <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
        <div className="flex-1">{err}</div>
      </div>
    );
  }
  if (ok) {
    return (
      <div className="mb-4 flex items-start gap-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
        <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
        <div className="flex-1">{ok}</div>
      </div>
    );
  }
  if (warn) {
    return (
      <div className="mb-4 flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
        <div className="flex-1">{warn}</div>
      </div>
    );
  }
  return null;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
  };

  const variants = {
    primary:
      'bg-brand-indigo hover:bg-brand-indigo-dark text-white shadow-sm focus:ring-brand-indigo',
    secondary:
      'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm focus:ring-slate-400',
    danger:
      'bg-rose-600 hover:bg-rose-700 text-white shadow-sm focus:ring-rose-500',
    success:
      'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm focus:ring-emerald-500',
    ghost:
      'bg-transparent hover:bg-slate-100 text-slate-600 focus:ring-slate-300',
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

