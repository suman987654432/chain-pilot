import { z } from 'zod';
const optStr = z.string().trim().optional().nullable().transform(v => (v ? v : null));
const optNum = z.union([z.coerce.number(), z.literal(''), z.null()]).optional().transform(v => (v === '' || v == null ? null : Number(v)));
const optId = z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional().transform(v => (v ? Number(v) : null));
const id = z.coerce.number().int().positive();
const qty = z.coerce.number().positive('Quantity must be greater than zero');
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const STATE = z.string().regex(/^\d{2}$/, 'State code is 2 digits (e.g. 27)');
const GSTIN = z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN').optional().nullable().or(z.literal('')).transform(v => v || null);
const gstOk = (o: any) => !o.gstin || o.gstin.slice(0, 2) === o.state_code;

export const locationSchema = z.object({ code: z.string().trim().min(1), name: z.string().trim().min(1), type: z.enum(['PLANT', 'WAREHOUSE', 'DEPOT']),
  city: optStr, state_code: STATE, supply_from: optId, transit_days: z.coerce.number().int().min(0).default(2), active: z.coerce.boolean().default(true) });
export const itemSchema = z.object({ code: z.string().trim().min(1), name: z.string().trim().min(1), uom: z.string().trim().default('NOS'),
  type: z.enum(['RAW', 'COMPONENT', 'FINISHED', 'TRADED', 'PACKING']), make_buy: z.enum(['MAKE', 'BUY']), hsn: optStr,
  gst_rate: z.coerce.number().refine(v => [0, 5, 12, 18, 28, 40].includes(v), 'GST rate must be 0, 5, 12, 18, 28 or 40'),
  lead_time_days: z.coerce.number().int().min(0), moq: qty.default(1), lot_multiple: qty.default(1), std_cost: z.coerce.number().min(0),
  sale_price: z.coerce.number().min(0).default(0), weight_kg: z.coerce.number().min(0).default(0), service_level: z.coerce.number().min(50).max(99.9).default(95),
  active: z.coerce.boolean().default(true) })
  .refine(i => i.make_buy === 'BUY' || ['FINISHED', 'COMPONENT'].includes(i.type), 'Only finished goods or components can be made in-house');
export const bomSchema = z.object({ lines: z.array(z.object({ component_id: id, qty_per: qty, scrap_pct: z.coerce.number().min(0).max(49).default(0) })) });
export const policySchema = z.object({ item_id: id, location_id: id, safety_stock: z.coerce.number().min(0), fixed_ss: z.coerce.boolean() });
export const supplierSchema = z.object({ code: z.string().trim().min(1), name: z.string().trim().min(1), gstin: GSTIN, state_code: STATE, city: optStr,
  email: optStr, phone: optStr, payment_terms_days: z.coerce.number().int().min(0).default(30), status: z.enum(['APPROVED', 'CONDITIONAL', 'BLOCKED']).default('APPROVED') })
  .refine(gstOk, 'GSTIN state code does not match the state');
export const sourceSchema = z.object({ supplier_id: id, item_id: id, price: qty, lead_time_days: z.coerce.number().int().min(0), moq: qty.default(1), preferred: z.coerce.boolean().default(false) });
export const customerSchema = z.object({ code: z.string().trim().min(1), name: z.string().trim().min(1), gstin: GSTIN, state_code: STATE, city: optStr, address: optStr,
  phone: optStr, channel: z.string().default('DISTRIBUTOR'), ship_from: optId }).refine(gstOk, 'GSTIN state code does not match the state');
export const transporterSchema = z.object({ name: z.string().trim().min(1), gstin: GSTIN, phone: optStr, rate_per_kg: z.coerce.number().min(0), min_charge: z.coerce.number().min(0) });
export const vehicleSchema = z.object({ transporter_id: optId, reg_no: z.string().trim().toUpperCase().min(4), type: z.string().default('TRUCK'), capacity_kg: qty });

export const historySchema = z.object({ rows: z.array(z.object({ item_code: z.string(), location_code: z.string(), period: z.string().regex(/^\d{4}-\d{2}(-01)?$/), qty: z.coerce.number().min(0) })).max(20000) });
export const overrideSchema = z.object({ item_id: id, location_id: id, period: date, qty: z.coerce.number().min(0).nullable(), note: optStr })
  .refine(o => o.qty == null || !!o.note, 'Give a reason for the forecast override');
export const convertSchema = z.object({ ids: z.array(id).min(1) });

export const prSchema = z.object({ location_id: id, need_date: date, remarks: optStr, lines: z.array(z.object({ item_id: id, qty, est_price: z.coerce.number().min(0).default(0) })).min(1) });
export const rejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason') });
export const rfqSchema = z.object({ pr_id: id, supplier_ids: z.array(id).min(2, 'Invite at least two suppliers for a competitive quote'), due_date: date });
export const quoteSchema = z.object({ supplier_id: id, lines: z.array(z.object({ rfq_line_id: id, price: qty, lead_time_days: z.coerce.number().int().min(0),
  freight: z.coerce.number().min(0).default(0), payment_terms_days: z.coerce.number().int().min(0).default(30), valid_until: date.optional().nullable() })).min(1) });
export const awardSchema = z.object({ awards: z.array(z.object({ rfq_line_id: id, supplier_id: id })).min(1), note: optStr });
export const poSchema = z.object({ supplier_id: id, location_id: id, expected_date: date, pr_id: optId, notes: optStr, freight: z.coerce.number().min(0).default(0),
  lines: z.array(z.object({ item_id: id, qty, price: qty })).min(1) });
export const grnSchema = z.object({ po_id: id, received_on: date.optional(), supplier_invoice: z.string().trim().min(1, 'Supplier invoice / challan number is required'), vehicle_no: optStr, remarks: optStr,
  lines: z.array(z.object({ po_line_id: id, received_qty: qty, rejected_qty: z.coerce.number().min(0).default(0), reject_reason: optStr }))
    .min(1).refine(ls => ls.every(l => l.rejected_qty <= l.received_qty), 'Rejected quantity cannot exceed received')
    .refine(ls => ls.every(l => !l.rejected_qty || !!l.reject_reason), 'Give a reason for rejected quantities') });

export const moSchema = z.object({ item_id: id, location_id: id, qty, due_date: date });
export const completeSchema = z.object({ qty });

export const soSchema = z.object({ customer_id: id, location_id: optId, promised_date: date, priority: z.coerce.number().int().min(1).max(5).default(3), customer_po: optStr,
  lines: z.array(z.object({ item_id: id, qty, price: optNum })).min(1) });
export const shipmentSchema = z.object({ from_location_id: id, so_ids: z.array(id).min(1), vehicle_id: optId, transporter_id: optId, driver_id: optId, planned_date: date.optional() });
export const dispatchSchema = z.object({ eway_bill_no: z.string().trim().regex(/^\d{12}$/, 'E-way bill number is 12 digits').optional().nullable().or(z.literal('')).transform(v => v || null) });
export const podSchema = z.object({ receiver_name: z.string().trim().min(2, 'Receiver name is required'), pod_photo: z.string().max(2_800_000, 'Photo too large').optional().nullable(),
  lat: optNum, lng: optNum, remarks: optStr,
  lines: z.array(z.object({ line_id: id, delivered_qty: z.coerce.number().min(0), short_reason: z.enum(['DAMAGED', 'REFUSED', 'SHORT_LOADED', 'OTHER']).optional().nullable() })).min(1) });
export const toSchema = z.object({ from_location_id: id, to_location_id: id, need_date: date, lines: z.array(z.object({ item_id: id, qty })).min(1) })
  .refine(t => t.from_location_id !== t.to_location_id, 'Source and destination must differ');
export const shipTransferSchema = z.object({ vehicle_id: optId, transporter_id: optId, driver_id: optId, eway_bill_no: dispatchSchema.shape.eway_bill_no });
export const receiveTransferSchema = z.object({ lines: z.array(z.object({ to_line_id: id, received_qty: z.coerce.number().min(0), short_reason: optStr })).min(1) });
export const adjustSchema = z.object({ item_id: id, location_id: id, qty: z.coerce.number().refine(v => v !== 0, 'Quantity cannot be zero'), reason: z.string().trim().min(5, 'Give a reason') });
export const memberSchema = z.object({ email: z.string().email(), name: z.string().optional(), password: z.string().min(8).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'PLANNER', 'BUYER', 'WAREHOUSE', 'LOGISTICS', 'DRIVER', 'VIEWER']), location_id: optId });
