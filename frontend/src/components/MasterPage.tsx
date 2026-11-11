'use client';

import React, { useState } from 'react';
import { apiCall, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, LoadingBadge, TableLoadingRow } from './ui';
import { Plus, Edit2, Search, RefreshCw } from 'lucide-react';

export type FieldDef = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'checkbox' | 'date';
  options?: { value: string | number; label: string }[];
  required?: boolean;
};

export type Col = {
  key: string;
  label: string;
  num?: boolean;
  render?: (r: any) => React.ReactNode;
};

export default function MasterPage({
  title,
  endpoint,
  fields,
  columns,
  defaults = {},
  canEdit = true,
  extra,
  filterRows,
}: {
  title: string;
  endpoint: string;
  fields: FieldDef[];
  columns: Col[];
  defaults?: any;
  canEdit?: boolean;
  extra?: React.ReactNode;
  filterRows?: (r: any) => boolean;
}) {
  const { data, error, reload, loading } = useData<any[]>(endpoint);
  const [ed, setEd] = useState<any>(null);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const body: any = {};
    for (const f of fields) {
      const v = ed[f.name];
      if (f.type === 'checkbox') body[f.name] = !!v;
      else if (v !== undefined && v !== '') body[f.name] = v;
      else if (v === '' && !f.required) body[f.name] = null;
    }
    try {
      const id = ed.id;
      await apiCall(id ? `${endpoint}/${id}` : endpoint, id ? 'PUT' : 'POST', body);
      setEd(null);
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  }

  const filtered = (filterRows ? data?.filter(filterRows) : data)?.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return Object.values(r).some((v) =>
      typeof v === 'string' || typeof v === 'number'
        ? String(v).toLowerCase().includes(q)
        : false
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">Manage master catalogue data and configurations.</p>
        </div>
        <div className="flex items-center gap-3">
          {extra}
          {canEdit && (
            <Button
              variant="primary"
              onClick={() => setEd({ ...defaults })}
              className="gap-2 shadow-md shadow-brand-indigo/15"
            >
              <Plus className="w-4 h-4" />
              <span>New {title.replace(/ies$/, 'y').replace(/s$/, '')}</span>
            </Button>
          )}
        </div>
      </div>

      <Msg err={error} />

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden w-full min-w-0">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${title.toLowerCase()}...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo focus:border-transparent transition-all"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500 self-start sm:self-auto">
            {loading && !data ? (
              <span className="inline-flex items-center gap-1.5 text-brand-indigo font-bold">
                <RefreshCw className="w-3 h-3 animate-spin text-brand-indigo" />
                <span>Loading records...</span>
              </span>
            ) : (
              `${filtered?.length ?? 0} records`
            )}
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs sm:text-sm min-w-[700px]">
            <thead className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`py-3.5 px-4 whitespace-nowrap ${c.num ? 'text-right' : ''}`}
                  >
                    {c.label}
                  </th>
                ))}
                {canEdit && <th className="py-3.5 px-4 text-right whitespace-nowrap">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
              {filtered?.map((r, i) => (
                <tr
                  key={r.id ?? i}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`py-3 px-4 whitespace-nowrap ${c.num ? 'text-right tabular-nums' : ''}`}
                    >
                      {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEd({ ...r })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-brand-indigo bg-slate-100 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {loading && (!data || data.length === 0) ? (
                <TableLoadingRow
                  colSpan={columns.length + (canEdit ? 1 : 0)}
                  text={`Fetching ${title.toLowerCase()} from network...`}
                />
              ) : filtered && filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (canEdit ? 1 : 0)}
                    className="py-12 text-center text-slate-400 font-medium"
                  >
                    No records found matching criteria
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {ed && (
        <Modal
          title={`${ed.id ? 'Edit' : 'New'} ${title.replace(/ies$/, 'y').replace(/s$/, '')}`}
          onClose={() => setEd(null)}
        >
          <Msg err={err} />
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map((f) => (
                <Field
                  key={f.name}
                  label={`${f.label}${f.required ? ' *' : ''}`}
                  wide={f.type === 'checkbox'}
                >
                  {f.type === 'select' ? (
                    <select
                      required={f.required}
                      value={ed[f.name] ?? ''}
                      onChange={(e) =>
                        setEd({ ...ed, [f.name]: e.target.value })
                      }
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo transition-all"
                    >
                      <option value="">— Select —</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'checkbox' ? (
                    <label className="flex items-center gap-2.5 cursor-pointer pt-2">
                      <input
                        type="checkbox"
                        checked={!!ed[f.name]}
                        onChange={(e) =>
                          setEd({ ...ed, [f.name]: e.target.checked })
                        }
                        className="w-4 h-4 text-brand-indigo rounded focus:ring-brand-indigo"
                      />
                      <span className="text-sm font-medium text-slate-700">
                        Active in System
                      </span>
                    </label>
                  ) : (
                    <input
                      type={f.type ?? 'text'}
                      step="any"
                      required={f.required}
                      value={ed[f.name] ?? ''}
                      onChange={(e) =>
                        setEd({ ...ed, [f.name]: e.target.value })
                      }
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo transition-all"
                    />
                  )}
                </Field>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setEd(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

