import { query, one } from './db';
import { HttpError } from './auth';
export function orgCrud(table: string, cols: string[], order = 'code') {
  return {
    list: (org: number) => query(`SELECT * FROM ${table} WHERE org_id=$1 ORDER BY ${order}`, [org]),
    create: (org: number, d: any) => { const c = cols.filter(k => d[k] !== undefined);
      return one(`INSERT INTO ${table}(org_id,${c.join(',')}) VALUES ($1,${c.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`, [org, ...c.map(k => d[k])]); },
    update: async (org: number, id: number, d: any) => { const c = cols.filter(k => d[k] !== undefined);
      if (!c.length) throw new HttpError(400, 'Nothing to update');
      const r = await one(`UPDATE ${table} SET ${c.map((k, i) => `${k}=$${i + 3}`).join(',')} WHERE org_id=$1 AND id=$2 RETURNING *`, [org, id, ...c.map(k => d[k])]);
      if (!r) throw new HttpError(404, 'Not found'); return r; },
  };
}
export const locations = orgCrud('locations', ['code', 'name', 'type', 'city', 'state_code', 'supply_from', 'transit_days', 'active']);
export const items = orgCrud('items', ['code', 'name', 'uom', 'type', 'make_buy', 'hsn', 'gst_rate', 'lead_time_days', 'moq', 'lot_multiple', 'std_cost', 'sale_price', 'weight_kg', 'service_level', 'active']);
export const suppliers = orgCrud('suppliers', ['code', 'name', 'gstin', 'state_code', 'city', 'email', 'phone', 'payment_terms_days', 'status']);
export const customers = orgCrud('customers', ['code', 'name', 'gstin', 'state_code', 'city', 'address', 'phone', 'channel', 'ship_from']);
export const transporters = orgCrud('transporters', ['name', 'gstin', 'phone', 'rate_per_kg', 'min_charge'], 'name');
export const vehicles = orgCrud('vehicles', ['transporter_id', 'reg_no', 'type', 'capacity_kg'], 'reg_no');
