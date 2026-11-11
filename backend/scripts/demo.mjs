// ChainPilot demo: 24 months of demand history, six weeks of operations, then today's planning → buying → delivery cycle.
// Every step goes through the REST API (direct SQL is used only to back-date simulated past activity).
// Usage: API=http://localhost:3000 DATABASE_URL=... node scripts/demo.mjs
import fs from 'fs';
import path from 'path';
import pg from 'pg';

// Parse .env if running standalone
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../.env'),
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
    break;
  }
}

const API = process.env.API ?? 'http://localhost:4000';
const connectionString = process.env.DATABASE_URL;
const isSsl =
  connectionString?.includes('sslmode=require') ||
  connectionString?.includes('neon.tech') ||
  connectionString?.includes('aws.') ||
  connectionString?.includes('render.com');

const db = new pg.Pool({
  connectionString,
  ssl: isSsl ? { rejectUnauthorized: false } : undefined,
});
const sql = (q, p) => db.query(q, p).then(r => r.rows);

let rnd = 20261102; const rand = () => { rnd |= 0; rnd = (rnd + 0x6D2B79F5) | 0; let t = Math.imul(rnd ^ (rnd >>> 15), 1 | rnd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rand() * a.length)];
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const day = n => { const d = new Date(TODAY + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ewb = () => String(Math.floor(1e11 + rand() * 9e11));

const T = {};
async function call(path, method = 'GET', body, who = 'admin') {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${T[who]}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`${r.status} ${j.error ?? ''}`); e.status = r.status; throw e; }
  return j;
}
let checks = 0;
const ok = (cond, msg) => { if (!cond) throw new Error('CHECK FAILED: ' + msg); checks++; console.log('  ✓ ' + msg); };
async function blocked(msg, re, fn) {
  try { await fn(); } catch (e) { if (re.test(e.message)) { checks++; console.log(`  ✓ blocked: ${msg} — ${e.message.replace(/^\d+ /, '')}`); return; } throw new Error(`${msg}: unexpected error ${e.message}`); }
  throw new Error(`${msg}: was NOT blocked`);
}

for (const [k, email] of Object.entries({ admin: 'admin', scm: 'scm', planner: 'planner', buyer: 'buyer', stores: 'stores', whdel: 'whdel', logistics: 'logistics', driver: 'driver', driver2: 'driver2', viewer: 'viewer' })) {
  const r = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${email}@scm.local`, password: 'Admin@123' }) });
  T[k] = (await r.json()).token;
}
const lk = await call('/api/lookups');
const ITEM = Object.fromEntries(lk.items.map(i => [i.code, i])), LOC = Object.fromEntries(lk.locations.map(l => [l.code, l]));
const FG = ['FAN-1200', 'FAN-900', 'FAN-PED', 'LED-9W'];

// ------------------------------------------------------------------ 1. demand history
console.log('Demand history (24 months, seasonal)');
const SEAS = { FAN: [.55, .8, 1.35, 1.6, 1.6, 1.25, .85, .8, .85, .85, .7, .6], PED: [.35, .6, 1.4, 2.0, 2.1, 1.4, .7, .6, .7, .8, .65, .45], LED: [.9, .9, .95, .95, 1, 1, 1, 1, 1.05, 1.25, 1.25, 1] };
const BASE = { 'FAN-1200': [1500, 'FAN'], 'FAN-900': [600, 'FAN'], 'FAN-PED': [500, 'PED'], 'LED-9W': [700, 'LED'] };
const SHARE = { 'PLT-BPL': .14, 'WH-DEL': .30, 'WH-MUM': .22, 'WH-BLR': .24, 'DEP-PUN': .10 };
const rows = [];
for (let k = 24; k >= 1; k--) {
  const d = new Date(TODAY.slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - k); const period = d.toISOString().slice(0, 7), m = d.getUTCMonth();
  for (const code of FG) for (const loc of Object.keys(SHARE)) {
    const [base, s] = BASE[code]; const trend = 1 + 0.01 * (24 - k);
    rows.push({ item_code: code, location_code: loc, period, qty: Math.round(base * SHARE[loc] * SEAS[s][m] * trend * (0.88 + rand() * 0.24)) });
  }
}
await blocked('buyer importing demand history', /role/, () => call('/api/demand/history', 'POST', { rows: rows.slice(0, 2) }, 'buyer'));
await blocked('importing history for the current month', /completed months/, () => call('/api/demand/history', 'POST', { rows: [{ item_code: 'FAN-900', location_code: 'WH-DEL', period: TODAY.slice(0, 7), qty: 5 }] }, 'planner'));
const imp = await call('/api/demand/history', 'POST', { rows }, 'planner');
ok(imp.imported === 480, `imported ${imp.imported} item × location × month rows`);
await call('/api/demand/forecast', 'POST', {}, 'planner');

// ------------------------------------------------------------------ 2. six weeks of operations (back-dated)
console.log('Six weeks of operations (purchasing, production, replenishment, deliveries)');
const pendingGRN = [];
const SUP = Object.fromEntries((await call('/api/suppliers')).map(s => [s.code, s]));
async function buy(d0, sup, lines, leadPlan, actualLead, accept = 1, rejectPct = 0) {
  const po = await call('/api/pos', 'POST', { supplier_id: SUP[sup].id, location_id: LOC['PLT-BPL'].id, expected_date: day(30), lines: lines.map(([c, q, p]) => ({ item_id: ITEM[c].id, qty: q, price: p })) }, 'buyer');
  const sub = await call(`/api/pos/${po.id}/submit`, 'POST', {}, 'buyer');
  if (sub.status === 'PENDING_APPROVAL') await call(`/api/pos/${po.id}/approve`, 'POST', {}, sub.approval_level === 'DIRECTOR' ? 'admin' : 'scm');
  await sql(`UPDATE purchase_orders SET po_date=$2::date, expected_date=$3, created_at=$2::date, approved_at=$2::date WHERE id=$1`, [po.id, d0, day(Math.round((Date.parse(d0) - Date.parse(TODAY)) / 864e5) + leadPlan)]);
  pendingGRN.push({ po: po.id, on: day(Math.round((Date.parse(d0) - Date.parse(TODAY)) / 864e5) + actualLead), accept, rejectPct });
}
async function receiveDue(upto) {
  for (const g of pendingGRN.filter(x => !x.done && x.on <= upto)) {
    const po = await call(`/api/pos/${g.po}`);
    await call('/api/grns', 'POST', { po_id: g.po, received_on: g.on, supplier_invoice: 'INV-' + Math.floor(rand() * 90000 + 10000), vehicle_no: 'MP04' + Math.floor(rand() * 9000 + 1000),
      lines: po.lines.map(l => { const rec = Math.round(Number(l.qty) * g.accept), rej = Math.round(rec * g.rejectPct); return { po_line_id: l.id, received_qty: rec, rejected_qty: rej, reject_reason: rej ? 'Dimensional / visual rejection at IQC' : null }; }) }, 'stores');
    g.done = true;
  }
}
async function produce(d, code, qty) {
  const mo = await call('/api/mos', 'POST', { item_id: ITEM[code].id, location_id: LOC['PLT-BPL'].id, qty, due_date: day(1) }, 'planner');
  await call(`/api/mos/${mo.id}/release`, 'POST', {}, 'planner');
  await call(`/api/mos/${mo.id}/complete`, 'POST', { qty }, 'stores');
  await sql(`UPDATE production_orders SET due_date=$2::date, completed_on=$2::date WHERE id=$1`, [mo.id, d]);
  await sql(`UPDATE stock_moves SET move_date=$2 WHERE ref_type='MO' AND ref_id=$1`, [mo.id, d]);
}
async function transfer(d, from, to, lines, receiver) {
  const free = Object.fromEntries((await call(`/api/stock?location_id=${LOC[from].id}`)).map(r => [r.code, Number(r.free)]));
  lines = lines.map(([c, q]) => [c, Math.min(q, Math.floor((free[c] ?? 0) / 50) * 50)]).filter(([, q]) => q > 0);
  if (!lines.length) return;
  const t = await call('/api/transfers', 'POST', { from_location_id: LOC[from].id, to_location_id: LOC[to].id, need_date: day(3), lines: lines.map(([c, q]) => ({ item_id: ITEM[c].id, qty: q })) }, 'planner');
  await call(`/api/transfers/${t.id}/release`, 'POST', {}, 'planner');
  await call(`/api/transfers/${t.id}/ship`, 'POST', { vehicle_id: lk.vehicles.find(v => v.reg_no === (to === 'DEP-PUN' ? 'MH12QW5521' : 'MP04GA7710')).id, driver_id: 8, eway_bill_no: ewb() }, from === 'PLT-BPL' ? 'stores' : 'scm');
  const full = await call(`/api/transfers/${t.id}`);
  await call(`/api/transfers/${t.id}/receive`, 'POST', { lines: full.lines.map(l => ({ to_line_id: l.id, received_qty: Number(l.shipped_qty) })) }, receiver);
  const arr = day(Math.round((Date.parse(d) - Date.parse(TODAY)) / 864e5) + LOC[to].transit_days);
  await sql(`UPDATE transfer_orders SET need_date=$2::date, received_on=$2::date, created_at=$3::date WHERE id=$1`, [t.id, arr, d]);
  await sql(`UPDATE shipments SET planned_date=$2::date, dispatched_at=$2::date, delivered_at=$3::date WHERE transfer_order_id=$1`, [t.id, d, arr]);
  await sql(`UPDATE stock_moves SET move_date=CASE WHEN type='TRANSFER_OUT' THEN $2::date ELSE $3::date END WHERE ref_type='TO' AND ref_id=$1`, [t.id, d, arr]);
}
const CUST = lk.customers;
const shippedBy = {};
async function salesTrip(d, loc) {
  const custs = CUST.filter(c => c.ship_from === LOC[loc].id), sos = [];
  for (let k = 0; k < 2; k++) {
    const items = [...FG].sort(() => rand() - 0.5).slice(0, 2);
    const so = await call('/api/sos', 'POST', { customer_id: pick(custs).id, promised_date: day(2), lines: items.map(c => ({ item_id: ITEM[c].id, qty: 10 + 5 * Math.floor(rand() * 7) })) }, 'logistics');
    const a = await call(`/api/sos/${so.id}/allocate`, 'POST', {}, 'logistics');
    if (a.lines.some(l => l.allocated > 0)) sos.push(so.id); else await call(`/api/sos/${so.id}/cancel`, 'POST', {}, 'logistics');
  }
  if (!sos.length) return;
  const veh = { 'PLT-BPL': 'MP04GA7710', 'WH-DEL': 'DL01LT3302', 'WH-MUM': 'MH12QW5521', 'DEP-PUN': 'MH12QW5521', 'WH-BLR': 'KA01AB4521' }[loc];
  const drv = ['WH-MUM', 'DEP-PUN'].includes(loc) ? 'driver2' : 'driver';
  const sh = await call('/api/shipments', 'POST', { from_location_id: LOC[loc].id, so_ids: sos, vehicle_id: lk.vehicles.find(v => v.reg_no === veh).id, driver_id: drv === 'driver' ? 8 : 9 }, 'logistics');
  await call(`/api/shipments/${sh.id}/dispatch`, 'POST', { eway_bill_no: ewb() }, 'logistics');
  const full = await call(`/api/shipments/${sh.id}`, 'GET', null, drv);
  const off = Math.round((Date.parse(d) - Date.parse(TODAY)) / 864e5);
  for (const st of full.stops) {
    const r = rand(), late = r < 0.14, short = r > 0.92;
    await call(`/api/shipments/${sh.id}/stops/${st.id}/deliver`, 'POST', { receiver_name: 'Store keeper', lines: st.lines.map((l, i) => ({ line_id: l.id, delivered_qty: short && i === 0 ? Number(l.qty) - 2 : Number(l.qty), short_reason: short && i === 0 ? 'DAMAGED' : null })) }, drv);
    await sql(`UPDATE shipment_stops SET delivered_at=$2 WHERE id=$1`, [st.id, day(off + (late ? 4 : 1)) + 'T15:00:00+05:30']);
    for (const l of st.lines) shippedBy[`${l.code}@${loc}`] = (shippedBy[`${l.code}@${loc}`] ?? 0) + Number(l.qty);
  }
  await sql(`UPDATE sales_orders SET order_date=$2::date, promised_date=$3, created_at=$2::date WHERE id = ANY($1)`, [sos, d, day(off + 2)]);
  await sql(`UPDATE shipments SET planned_date=$2::date, dispatched_at=$2::date, delivered_at=$3::date WHERE id=$1`, [sh.id, d, day(off + 2)]);
  await sql(`UPDATE stock_moves SET move_date=$2 WHERE ref_type='SHIPMENT' AND ref_id=$1`, [sh.id, d]);
}
for (let wk = 6; wk >= 1; wk--) {
  const d0 = day(-7 * wk);
  if (wk === 6) {
    await buy(d0, 'SUP-JYM', [['MTR-1200', 1000, 640], ['MTR-400', 300, 610]], 21, 26);           // motors: 5 days late
    await buy(d0, 'SUP-KVP', [['BLD-1200', 600, 150], ['CAN-01', 600, 95]], 14, 13);               // on time
    await buy(d0, 'SUP-SHC', [['CAP-25', 2000, 18]], 7, 7, 1, 0.02);                               // 2 % rejected
    await buy(d0, 'SUP-BPK', [['BOX-L', 1000, 38], ['BOX-P', 500, 55]], 5, 4);
    await buy(d0, 'SUP-LUM', [['LED-9W', 400, 420]], 10, 12, 0.9);                                // late and short
  }
  if (wk === 3) {
    await buy(d0, 'SUP-APX', [['MTR-900', 300, 575]], 14, 12);
    await buy(d0, 'SUP-KVP', [['GRL-400', 300, 140], ['STD-PED', 300, 210]], 14, 15);
    await buy(d0, 'SUP-BPK', [['BOX-S', 1000, 32]], 5, 5);
  }
  await receiveDue(day(-7 * wk + 6));
  await produce(day(-7 * wk + 1), 'FAN-1200', 250); await produce(day(-7 * wk + 1), 'FAN-900', 100); await produce(day(-7 * wk + 1), 'FAN-PED', 50);
  for (const to of ['WH-DEL', 'WH-MUM', 'WH-BLR']) {
    const lines = FG.map(c => [c, Math.max(50, Math.ceil((shippedBy[`${c}@${to}`] ?? 60) / 50) * 50)]).filter(([c]) => c !== 'FAN-PED' || wk % 2 === 0);
    await transfer(day(-7 * wk + 1), 'PLT-BPL', to, lines, to === 'WH-DEL' ? 'whdel' : 'scm');
    shippedBy[Object.keys(shippedBy).find(k => k.endsWith(to)) ?? ''] = 0; for (const c of FG) shippedBy[`${c}@${to}`] = 0;
  }
  if (wk % 2 === 0) await transfer(day(-7 * wk + 2), 'WH-MUM', 'DEP-PUN', [['FAN-1200', 50], ['FAN-900', 50], ['LED-9W', 50]], 'scm');
  for (const [i, loc] of ['PLT-BPL', 'WH-DEL', 'WH-MUM', 'WH-BLR', 'DEP-PUN'].entries()) await salesTrip(day(-7 * wk + 1 + (i % 4)), loc);
}
await receiveDue(day(-1));
await call(`/api/pos/${pendingGRN.find(g => g.accept < 1).po}/close`, 'POST', { reason: 'Supplier cannot supply balance' }, 'buyer');
// simulated dispatches were posted to this month's demand; history up to last month is already imported
await sql(`DELETE FROM demand_history WHERE period = date_trunc('month', $1::date)`, [TODAY]);
const n = await sql(`SELECT (SELECT COUNT(*) FROM shipments WHERE type='SALES') s, (SELECT COUNT(*) FROM transfer_orders) t, (SELECT COUNT(*) FROM production_orders) m, (SELECT COUNT(*) FROM grns) g`);
console.log(`  ${n[0].s} delivery trips · ${n[0].t} transfers · ${n[0].m} production orders · ${n[0].g} goods receipts`);

// ------------------------------------------------------------------ 3. today: forecast
console.log('Forecast & inventory policy');
await blocked('viewer running the forecast', /role/, () => call('/api/demand/forecast', 'POST', {}, 'viewer'));
const fr = await call('/api/demand/forecast', 'POST', {}, 'planner');
ok(fr.forecasted === 20, `forecast run: ${fr.forecasted} item × location series, ${fr.months} months ahead`);
const ft = await call('/api/demand/forecast?location_id=' + LOC['WH-DEL'].id);
const ped = ft.rows.find(r => r.code === 'FAN-PED'), f1200 = ft.rows.find(r => r.code === 'FAN-1200');
ok(ped.method === 'SEASONAL', `pedestal fan at Delhi uses the seasonal model (back-test MAPE ${ped.mape}%)`);
const pedFc = ped.fc.map(f => Number(f.system));
ok(pedFc[5] > pedFc[0] * 2, `summer build-up forecast: ${pedFc[0]} now → ${pedFc[5]} in ${ped.fc[5].period.slice(0, 7)}`);
ok(Number(f1200.safety_stock) > 0 && Number(f1200.reorder_point) > Number(f1200.safety_stock), `FAN-1200 @ WH-DEL: safety stock ${Number(f1200.safety_stock)}, reorder point ${Number(f1200.reorder_point)} (service level 97.5 %)`);
await blocked('override without a reason', /reason/, () => call('/api/demand/override', 'POST', { item_id: ITEM['FAN-1200'].id, location_id: LOC['WH-DEL'].id, period: ft.rows[0].fc[1].period, qty: 999 }, 'planner'));
await call('/api/demand/override', 'POST', { item_id: ITEM['FAN-1200'].id, location_id: LOC['WH-DEL'].id, period: f1200.fc[1].period, qty: Math.round(Number(f1200.fc[1].system) * 1.3), note: 'Dealer scheme: +30 % pre-season push' }, 'planner');
ok(true, 'planner override recorded with reason (+30 % dealer scheme)');

// ------------------------------------------------------------------ 4. open orders & ATP
console.log('Sales orders, ATP & allocation');
const atp = await call(`/api/atp?item_id=${ITEM['FAN-PED'].id}&location_id=${LOC['DEP-PUN'].id}&qty=500`);
ok(atp.can_promise_on === null || atp.can_promise_on > TODAY, `ATP: 500 pedestal fans at Pune — free ${Number(atp.free)}, cannot promise today`);
const punStock = (await call(`/api/stock?location_id=${LOC['DEP-PUN'].id}`)).filter(r => FG.includes(r.code)).sort((a, b) => b.free - a.free)[0];
const openSOs = [];
for (const [loc, c, lines, prom] of [['WH-DEL', 'C-DEL01', [['FAN-1200', 120], ['FAN-PED', 40]], 2], ['WH-DEL', 'C-NOI01', [['FAN-900', 60], ['LED-9W', 80]], 2],
  ['WH-DEL', 'C-JAI01', [['FAN-1200', 80]], 3], ['WH-MUM', 'C-MUM01', [['FAN-1200', 90], ['FAN-900', 40]], 2], ['DEP-PUN', 'C-PUN01', [[punStock.code, Number(punStock.free) + 40]], 4], ['WH-BLR', 'C-ECM01', [['LED-9W', 150], ['FAN-1200', 60]], 1]]) {
  const so = await call('/api/sos', 'POST', { customer_id: CUST.find(x => x.code === c).id, promised_date: day(prom), lines: lines.map(([i, q]) => ({ item_id: ITEM[i].id, qty: q })) }, 'logistics');
  const a = await call(`/api/sos/${so.id}/allocate`, 'POST', {}, 'logistics'); openSOs.push({ ...so, alloc: a, loc, code: c });
}
const pun = openSOs.find(s => s.code === 'C-PUN01');
ok(pun.alloc.status === 'PARTIAL' && pun.alloc.lines[0].short === 40, `Pune order for ${punStock.code} allocated partially: ${pun.alloc.lines[0].allocated} of ${pun.alloc.lines[0].wanted} (short ${pun.alloc.lines[0].short})`);
await blocked('stock adjustment eating into reserved stock', /reserved for orders/, async () => {
  const st = (await call(`/api/stock?location_id=${LOC['DEP-PUN'].id}`)).find(r => r.code === punStock.code);
  await call('/api/stock/adjust', 'POST', { item_id: st.item_id, location_id: LOC['DEP-PUN'].id, qty: -Number(st.on_hand), reason: 'Cycle count write-off' }, 'scm');
});

// ------------------------------------------------------------------ 5. MRP / DRP
console.log('Planning run (MRP / DRP, 12 weeks)');
await blocked('buyer running MRP', /role/, () => call('/api/planning', 'POST', {}, 'buyer'));
const run = await call('/api/planning', 'POST', {}, 'planner');
ok(run.transfer > 0 && run.make > 0 && run.buy > 0, `${run.planned_orders} planned orders: ${run.transfer} transfer · ${run.make} make · ${run.buy} buy · ${run.exceptions} exceptions`);
const plan = await call('/api/planning');
const plantFan = (await call(`/api/planning/grid?item_id=${ITEM['FAN-1200'].id}&location_id=${LOC['PLT-BPL'].id}`)).grid;
ok(plantFan.some(w => w.dependent > 0), `FAN-1200 at the plant carries dependent demand from warehouse transfers (${plantFan.reduce((a, w) => a + w.dependent, 0)} units over 12 weeks)`);
const motor = (await call(`/api/planning/grid?item_id=${ITEM['MTR-1200'].id}&location_id=${LOC['PLT-BPL'].id}`)).grid;
const fanMake = plan.orders.filter(o => o.kind === 'MAKE' && o.item_code === 'FAN-1200').reduce((a, o) => a + Number(o.qty), 0);
const moOpen = (await call('/api/mos?status=OPEN')).filter(m => m.code === 'FAN-1200').reduce((a, m) => a + Number(m.qty) - Number(m.completed_qty), 0);
ok(Math.abs(motor.reduce((a, w) => a + w.dependent, 0) - (fanMake + moOpen)) < 1, `BOM explosion: motor requirement ${motor.reduce((a, w) => a + w.dependent, 0)} = FAN-1200 production ${fanMake + moOpen} × 1`);
ok(plan.items.some(i => i.exceptions.includes('EXPEDITE') || i.exceptions.includes('STOCKOUT_RISK')), `exceptions flagged: ${[...new Set(plan.items.flatMap(i => i.exceptions))].join(', ')}`);
const conv = await call('/api/planning/convert', 'POST', { ids: plan.orders.filter(o => o.status === 'OPEN' && new Date(o.release_date) <= new Date(day(7))).map(o => o.id) }, 'planner');
ok(conv.created.some(x => x.startsWith('PR-')) && conv.created.some(x => x.startsWith('TO-')) && conv.created.some(x => x.startsWith('MO-')), `planned orders due this week converted: ${conv.created.length} documents (PR / TO / MO)`);
await blocked('converting the same planned orders twice', /no longer open/, () => call('/api/planning/convert', 'POST', { ids: [plan.orders.find(o => o.status === 'OPEN').id] }, 'planner'));

// ------------------------------------------------------------------ 6. procurement
console.log('Procurement: requisition → RFQ → PO approval → GRN');
const prs = await call('/api/prs?status=SUBMITTED');
await blocked('buyer approving a requisition', /role/, () => call(`/api/prs/${prs[0].id}/approve`, 'POST', {}, 'buyer'));
const own = await call('/api/prs', 'POST', { location_id: LOC['PLT-BPL'].id, need_date: day(20), lines: [{ item_id: ITEM['CAP-25'].id, qty: 500 }] }, 'scm');
await blocked('approving your own requisition', /own/, () => call(`/api/prs/${own.id}/approve`, 'POST', {}, 'scm'));
await call(`/api/prs/${own.id}/reject`, 'POST', { reason: 'Covered by the MRP requisition' }, 'admin');
for (const p of prs) await call(`/api/prs/${p.id}/approve`, 'POST', {}, 'scm');
ok(prs.length > 0, `${prs.length} MRP requisition(s) approved by the SCM manager`);
// pre-season build beyond the 12-week horizon: the planner raises a manual requisition for motors, which goes to competitive RFQ
const seasonPR = await call('/api/prs', 'POST', { location_id: LOC['PLT-BPL'].id, need_date: day(21), remarks: 'Pre-season build Feb–Mar', lines: [{ item_id: ITEM['MTR-1200'].id, qty: 800 }, { item_id: ITEM['MTR-400'].id, qty: 600 }] }, 'planner');
await call(`/api/prs/${seasonPR.id}/approve`, 'POST', {}, 'scm');
const motorPR = await call(`/api/prs/${seasonPR.id}`);
// split: motors go to RFQ, everything else is ordered from the preferred source
await blocked('RFQ with a single supplier', /at least two/, () => call('/api/rfqs', 'POST', { pr_id: motorPR.id, supplier_ids: [SUP['SUP-JYM'].id], due_date: day(3) }, 'buyer'));
await blocked('inviting a blocked supplier', /blocked/, () => call('/api/rfqs', 'POST', { pr_id: motorPR.id, supplier_ids: [SUP['SUP-JYM'].id, SUP['SUP-NOV'].id], due_date: day(3) }, 'buyer'));
const rfq = await call('/api/rfqs', 'POST', { pr_id: motorPR.id, supplier_ids: [SUP['SUP-JYM'].id, SUP['SUP-APX'].id], due_date: day(3) }, 'buyer');
let rv = await call(`/api/rfqs/${rfq.id}`);
const priceOf = { 'SUP-JYM': { MTR: 0.98 }, 'SUP-APX': { MTR: 1.02 } };
for (const [code, lead, fr_] of [['SUP-JYM', 24, 6000], ['SUP-APX', 12, 2500]])
  await call(`/api/rfqs/${rfq.id}/quotes`, 'POST', { supplier_id: SUP[code].id, lines: rv.comparison.map(l => ({ rfq_line_id: l.id, price: Math.round(ITEM[l.code].std_cost * priceOf[code].MTR), lead_time_days: lead, freight: fr_, payment_terms_days: code === 'SUP-JYM' ? 45 : 30 })) }, 'buyer');
await blocked('quote from a supplier who was not invited', /not invited/, () => call(`/api/rfqs/${rfq.id}/quotes`, 'POST', { supplier_id: SUP['SUP-KVP'].id, lines: [{ rfq_line_id: rv.comparison[0].id, price: 600, lead_time_days: 10 }] }, 'buyer'));
rv = await call(`/api/rfqs/${rfq.id}`);
const l0 = rv.comparison[0], rec = l0.quotes[0];
ok(l0.lowest === SUP['SUP-JYM'].id && l0.recommended === SUP['SUP-APX'].id, `quote comparison: Jyoti is cheapest but late for the need date — Apex recommended (score ${rec.score} vs ${l0.quotes[1].score})`);
await blocked('awarding the cheaper-but-late quote without justification', /justification/, () => call(`/api/rfqs/${rfq.id}/award`, 'POST', { awards: rv.comparison.map(l => ({ rfq_line_id: l.id, supplier_id: SUP['SUP-JYM'].id })) }, 'buyer'));
const aw = await call(`/api/rfqs/${rfq.id}/award`, 'POST', { awards: rv.comparison.map(l => ({ rfq_line_id: l.id, supplier_id: l.recommended })) }, 'buyer');
const motorPO = (await call('/api/pos?status=DRAFT')).find(p => p.po_no === aw.purchase_orders[0]);
const sub = await call(`/api/pos/${motorPO.id}/submit`, 'POST', {}, 'buyer');
ok(sub.status === 'PENDING_APPROVAL', `${motorPO.po_no} ₹${Number(motorPO.total).toLocaleString('en-IN')} → needs ${sub.approval_level} approval`);
await blocked('buyer approving own PO', /role/, () => call(`/api/pos/${motorPO.id}/approve`, 'POST', {}, 'buyer'));
await blocked('receiving goods against an unapproved PO', /not approved/, async () => { const p = await call(`/api/pos/${motorPO.id}`); await call('/api/grns', 'POST', { po_id: p.id, supplier_invoice: 'X1', lines: [{ po_line_id: p.lines[0].id, received_qty: 1 }] }, 'stores'); });
await call(`/api/pos/${motorPO.id}/approve`, 'POST', {}, sub.approval_level === 'DIRECTOR' ? 'admin' : 'scm');
// other approved MRP requisitions → POs from the preferred supplier
const done = [];
for (const p of prs.filter(x => x.id !== motorPR.id)) {
  const full = await call(`/api/prs/${p.id}`); const bySup = {};
  for (const l of full.lines) { const s_ = l.sources.find(x => x.preferred) ?? l.sources[0]; (bySup[s_.supplier_id] ??= []).push({ item_id: l.item_id, qty: Number(l.qty), price: Number(s_.price) }); }
  for (const [sid, lines] of Object.entries(bySup)) {                       // a requisition can be split across suppliers
    const po = await call('/api/pos', 'POST', { supplier_id: Number(sid), location_id: full.location_id, pr_id: full.id, expected_date: full.need_date > TODAY ? full.need_date : day(7), lines }, 'buyer');
    const r = await call(`/api/pos/${po.id}/submit`, 'POST', {}, 'buyer');
    if (r.status === 'PENDING_APPROVAL') await call(`/api/pos/${po.id}/approve`, 'POST', {}, r.approval_level === 'DIRECTOR' ? 'admin' : 'scm');
    done.push(`${po.po_no} ${r.approval_level}${po.price_flags.length ? ' (' + po.price_flags[0] + ')' : ''}`);
  }
}
ok(done.length > 0, `requisitions ordered from preferred sources: ${done.join(' · ')}`);
const big = await call('/api/pos', 'POST', { supplier_id: SUP['SUP-JYM'].id, location_id: LOC['PLT-BPL'].id, expected_date: day(25), lines: [{ item_id: ITEM['MTR-1200'].id, qty: 2000, price: 640 }] }, 'buyer');
const bs = await call(`/api/pos/${big.id}/submit`, 'POST', {}, 'buyer');
ok(bs.approval_level === 'DIRECTOR', `₹${Number(big.total).toLocaleString('en-IN')} season-build PO routed to director approval`);
await blocked('SCM manager approving a director-level PO', /director/, () => call(`/api/pos/${big.id}/approve`, 'POST', {}, 'scm'));
await call(`/api/pos/${big.id}/approve`, 'POST', {}, 'admin');
const small = await call('/api/pos', 'POST', { supplier_id: SUP['SUP-BPK'].id, location_id: LOC['PLT-BPL'].id, expected_date: day(5), lines: [{ item_id: ITEM['BOX-P'].id, qty: 500, price: 70 }] }, 'buyer');
const ss_ = await call(`/api/pos/${small.id}/submit`, 'POST', {}, 'buyer');
ok(small.price_flags.length > 0 && ss_.status === 'PENDING_APPROVAL', `small PO with price 27 % above contract is flagged and held for approval (${small.price_flags[0]})`);
await call(`/api/pos/${small.id}/reject`, 'POST', { reason: 'Use contract price ₹55' }, 'scm');
await blocked('PO to a blocked supplier', /blocked/, () => call('/api/pos', 'POST', { supplier_id: SUP['SUP-NOV'].id, location_id: LOC['PLT-BPL'].id, expected_date: day(10), lines: [{ item_id: ITEM['GRL-400'].id, qty: 300, price: 128 }] }, 'buyer'));
const cart = await call('/api/pos', 'POST', { supplier_id: SUP['SUP-BPK'].id, location_id: LOC['PLT-BPL'].id, expected_date: day(5), lines: [{ item_id: ITEM['BOX-S'].id, qty: 1000, price: 32 }] }, 'buyer');
const cs = await call(`/api/pos/${cart.id}/submit`, 'POST', {}, 'buyer');
ok(cs.status === 'APPROVED' && cs.approval_level === 'AUTO', `₹${Number(cart.total).toLocaleString('en-IN')} carton PO auto-released (within ₹1,00,000 buyer limit)`);
const mp = await call(`/api/pos/${motorPO.id}`);
await blocked('Delhi warehouse receiving at the plant', /own location/, () => call('/api/grns', 'POST', { po_id: mp.id, supplier_invoice: 'APX/551', lines: [{ po_line_id: mp.lines[0].id, received_qty: 10 }] }, 'whdel'));
await blocked('over-receipt beyond 5 % tolerance', /tolerance/, () => call('/api/grns', 'POST', { po_id: mp.id, supplier_invoice: 'APX/551', lines: mp.lines.map(l => ({ po_line_id: l.id, received_qty: Math.ceil(Number(l.qty) * 1.08) })) }, 'stores'));
await blocked('rejection without a reason', /reason/, () => call('/api/grns', 'POST', { po_id: mp.id, supplier_invoice: 'APX/551', lines: mp.lines.map(l => ({ po_line_id: l.id, received_qty: 100, rejected_qty: 5 })) }, 'stores'));
const avgBefore = Number((await call(`/api/items/${ITEM['MTR-1200'].id}`)).avg_cost);
const g1 = await call('/api/grns', 'POST', { po_id: mp.id, supplier_invoice: 'APX/551', vehicle_no: 'HR38T4410', lines: mp.lines.map(l => ({ po_line_id: l.id, received_qty: Math.round(Number(l.qty) / 2), rejected_qty: 4, reject_reason: 'Winding insulation damage' })) }, 'stores');
ok(g1.po_status === 'PARTIAL', `${g1.grn_no}: half received, 4 rejected → PO PARTIAL`);
const avgAfter = Number((await call(`/api/items/${ITEM['MTR-1200'].id}`)).avg_cost);
ok(avgAfter !== avgBefore, `moving average cost of MTR-1200 updated ₹${avgBefore.toFixed(2)} → ₹${avgAfter.toFixed(2)} (incl. freight)`);

// ------------------------------------------------------------------ 7. production
console.log('Production');
const bigMO = await call('/api/mos', 'POST', { item_id: ITEM['FAN-PED'].id, location_id: LOC['PLT-BPL'].id, qty: 5000, due_date: day(10) }, 'planner');
await blocked('releasing a production order without components', /shortage/, () => call(`/api/mos/${bigMO.id}/release`, 'POST', {}, 'planner'));
await call(`/api/mos/${bigMO.id}/cancel`, 'POST', {}, 'planner');
const mos = (await call('/api/mos?status=PLANNED')).filter(m => m.id !== bigMO.id && m.mo_no);
let released = 0;
for (const m of mos) { try { await call(`/api/mos/${m.id}/release`, 'POST', {}, 'planner'); released++; } catch { /* waits for components */ } }
const rel = (await call('/api/mos?status=RELEASED'))[0];
if (rel) { await call(`/api/mos/${rel.id}/complete`, 'POST', { qty: Number(rel.qty) }, 'stores'); }
ok(released > 0, `${released} MRP production order(s) released; ${rel?.mo_no} completed — components back-flushed, fans received`);
await blocked('reporting more output than ordered', /left on this order/, async () => { const m = (await call('/api/mos?status=RELEASED'))[0] ?? rel; await call(`/api/mos/${m.id}/complete`, 'POST', { qty: 999999 }, 'stores'); });

// ------------------------------------------------------------------ 8. transfers
console.log('Inter-location transfers');
const vByReg = r => lk.vehicles.find(v => v.reg_no === r);
// (a) the MRP transfer to Mumbai — blocked until the LED stock arrives at the plant
const tMum = (await call('/api/transfers?status=DRAFT')).find(t => t.from_code === 'PLT-BPL');
await blocked('shipping a transfer before release', /Release the transfer/, () => call(`/api/transfers/${tMum.id}/ship`, 'POST', { vehicle_id: vByReg('MP04GA7710').id }, 'stores'));
const short = (await call(`/api/transfers/${tMum.id}`)).lines.find(l => Number(l.free_at_source) < Number(l.qty));
if (short) {
  await blocked(`releasing ${tMum.to_no} while ${short.code} is not in stock at the plant`, /free at source/, () => call(`/api/transfers/${tMum.id}/release`, 'POST', {}, 'planner'));
  for (const p of (await call('/api/pos?status=RECEIVABLE')).filter(p => p.location_code === 'PLT-BPL')) {     // supplier delivers → stores receives
    const full = await call(`/api/pos/${p.id}`);
    if (full.lines.some(l => l.item_id === short.item_id)) await call('/api/grns', 'POST', { po_id: p.id, supplier_invoice: 'LUM/2611/88', lines: full.lines.map(l => ({ po_line_id: l.id, received_qty: Number(l.qty) - Number(l.received_qty) })) }, 'stores');
  }
}
await call(`/api/transfers/${tMum.id}/release`, 'POST', {}, 'planner');
await call(`/api/transfers/${tMum.id}/ship`, 'POST', { vehicle_id: vByReg('MP04GA7710').id, driver_id: 8, eway_bill_no: '351002884700' }, 'stores');
const tm = await call(`/api/transfers/${tMum.id}`);
await call(`/api/transfers/${tMum.id}/receive`, 'POST', { lines: tm.lines.map(l => ({ to_line_id: l.id, received_qty: Number(l.shipped_qty) })) }, 'scm');
ok(true, `${tMum.to_no} (MRP) released after the LED receipt, shipped and received at ${tMum.to_code}`);
// (b) pre-season stock build for Delhi
const tDel = await call('/api/transfers', 'POST', { from_location_id: LOC['PLT-BPL'].id, to_location_id: LOC['WH-DEL'].id, need_date: day(4), lines: [{ item_id: ITEM['FAN-1200'].id, qty: 300 }] }, 'planner');
await call(`/api/transfers/${tDel.id}/release`, 'POST', {}, 'planner');
await blocked('overloading the 750 kg Tata Ace with 1,440 kg', /capacity/, () => call(`/api/transfers/${tDel.id}/ship`, 'POST', { vehicle_id: vByReg('MP04T1188').id, driver_id: 8, eway_bill_no: '351002884716' }, 'stores'));
await blocked('dispatch without e-way bill above ₹50,000', /e-way bill/, () => call(`/api/transfers/${tDel.id}/ship`, 'POST', { vehicle_id: vByReg('MP04GA7710').id, driver_id: 8 }, 'stores'));
await call(`/api/transfers/${tDel.id}/ship`, 'POST', { vehicle_id: vByReg('MP04GA7710').id, driver_id: 8, eway_bill_no: '351002884716' }, 'stores');
const it_ = (await call('/api/reports/control-tower')).inventory.in_transit_value;
ok(it_ > 0, `${tDel.to_no} in transit to WH-DEL: ₹${it_.toLocaleString('en-IN')} of stock on the road`);
const tdd = await call(`/api/transfers/${tDel.id}`);
await blocked('plant stores receiving a Delhi-bound transfer', /own location/, () => call(`/api/transfers/${tDel.id}/receive`, 'POST', { lines: tdd.lines.map(l => ({ to_line_id: l.id, received_qty: Number(l.shipped_qty) })) }, 'stores'));
await blocked('receiving short without a reason', /record the reason/, () => call(`/api/transfers/${tDel.id}/receive`, 'POST', { lines: tdd.lines.map(l => ({ to_line_id: l.id, received_qty: Number(l.shipped_qty) - 3 })) }, 'whdel'));
await call(`/api/transfers/${tDel.id}/receive`, 'POST', { lines: tdd.lines.map(l => ({ to_line_id: l.id, received_qty: Number(l.shipped_qty) - 3, short_reason: 'Transit damage — 3 cartons crushed' })) }, 'whdel');
ok(true, `${tDel.to_no} received at WH-DEL by the Delhi warehouse; 3 units recorded as transit damage`);

// ------------------------------------------------------------------ 9. delivery trip & proof of delivery
console.log('Delivery trip & proof of delivery');
const del = openSOs.filter(s => s.loc === 'WH-DEL');
for (const s of del) await call(`/api/sos/${s.id}/allocate`, 'POST', {}, 'logistics');
await blocked('loading 3 Delhi orders on a 750 kg Tata Ace', /capacity/, () => call('/api/shipments', 'POST', { from_location_id: LOC['WH-DEL'].id, so_ids: del.map(s => s.id), vehicle_id: lk.vehicles.find(v => v.reg_no === 'MP04T1188').id, driver_id: 8 }, 'logistics'));
const trip = await call('/api/shipments', 'POST', { from_location_id: LOC['WH-DEL'].id, so_ids: del.map(s => s.id), vehicle_id: lk.vehicles.find(v => v.reg_no === 'DL01LT3302').id, driver_id: 8 }, 'logistics');
ok(trip.freight_cost > 0, `${trip.shp_no}: ${del.length} stops, ${Math.round(trip.total_weight)} kg, freight ₹${Number(trip.freight_cost).toLocaleString('en-IN')}`);
await blocked('putting an order on a second trip', /already on a planned trip/, () => call('/api/shipments', 'POST', { from_location_id: LOC['WH-DEL'].id, so_ids: [del[0].id], vehicle_id: lk.vehicles.find(v => v.reg_no === 'DL01LT3302').id }, 'logistics'));
await blocked('driver delivering before dispatch', /not been dispatched/, async () => { const t = await call(`/api/shipments/${trip.id}`, 'GET', null, 'driver'); await call(`/api/shipments/${trip.id}/stops/${t.stops[0].id}/deliver`, 'POST', { receiver_name: 'X Y', lines: t.stops[0].lines.map(l => ({ line_id: l.id, delivered_qty: Number(l.qty) })) }, 'driver'); });
await blocked('dispatch without e-way bill', /e-way bill/, () => call(`/api/shipments/${trip.id}/dispatch`, 'POST', {}, 'logistics'));
await call(`/api/shipments/${trip.id}/dispatch`, 'POST', { eway_bill_no: '351002884999' }, 'logistics');
const tv = await call(`/api/shipments/${trip.id}`, 'GET', null, 'driver');
await blocked('another driver opening this trip', /another driver/, () => call(`/api/shipments/${trip.id}`, 'GET', null, 'driver2'));
await blocked('POD without receiver name', /Receiver name/, () => call(`/api/shipments/${trip.id}/stops/${tv.stops[0].id}/deliver`, 'POST', { receiver_name: '', lines: tv.stops[0].lines.map(l => ({ line_id: l.id, delivered_qty: Number(l.qty) })) }, 'driver'));
await call(`/api/shipments/${trip.id}/stops/${tv.stops[0].id}/deliver`, 'POST', { receiver_name: 'Anil Sharma', lat: 28.6519, lng: 77.2315, lines: tv.stops[0].lines.map(l => ({ line_id: l.id, delivered_qty: Number(l.qty) })) }, 'driver');
await blocked('short delivery without a reason', /reason/, () => call(`/api/shipments/${trip.id}/stops/${tv.stops[1].id}/deliver`, 'POST', { receiver_name: 'Ritu Malhotra', lines: tv.stops[1].lines.map((l, i) => ({ line_id: l.id, delivered_qty: Number(l.qty) - (i === 0 ? 10 : 0) })) }, 'driver'));
const stBefore = Number((await call(`/api/stock?location_id=${LOC['WH-DEL'].id}`)).find(r => r.item_id === tv.stops[1].lines[0].item_id).on_hand);
await call(`/api/shipments/${trip.id}/stops/${tv.stops[1].id}/deliver`, 'POST', { receiver_name: 'Ritu Malhotra', lines: tv.stops[1].lines.map((l, i) => ({ line_id: l.id, delivered_qty: Number(l.qty) - (i === 0 ? 10 : 0), short_reason: i === 0 ? 'REFUSED' : null })) }, 'driver');
const stAfter = Number((await call(`/api/stock?location_id=${LOC['WH-DEL'].id}`)).find(r => r.item_id === tv.stops[1].lines[0].item_id).on_hand);
ok(stAfter - stBefore === 10, `10 refused units returned to Delhi stock and the order line reopened`);
const fin = await call(`/api/shipments/${trip.id}/stops/${tv.stops[2].id}/deliver`, 'POST', { receiver_name: 'Mahesh Gupta', lines: tv.stops[2].lines.map(l => ({ line_id: l.id, delivered_qty: Number(l.qty) })) }, 'driver');
ok(fin.trip_complete, `trip ${trip.shp_no} complete (status PARTIAL because of the refusal)`);

// ------------------------------------------------------------------ 10. control tower
console.log('Control tower');
const ct = await call('/api/reports/control-tower');
console.log(`  inventory ₹${ct.inventory.value.toLocaleString('en-IN')} (in transit ₹${ct.inventory.in_transit_value.toLocaleString('en-IN')}) · turns ${ct.inventory.turns}`);
console.log(`  customer OTIF ${ct.otif.pct}% (${ct.otif.otif}/${ct.otif.stops} stops) · fill rate ${ct.fill_rate}% · supplier OTIF ${ct.supplier_otif}% · forecast accuracy ${ct.forecast.accuracy}%`);
console.log(`  POs awaiting approval ${ct.procurement.pending_approval} · late POs ${ct.procurement.late_pos} · open orders ${ct.logistics.open_orders} (late ${ct.logistics.late_orders}) · freight 30d ₹${Math.round(Number(ct.logistics.freight_30d)).toLocaleString('en-IN')}`);
console.log('  suppliers: ' + ct.suppliers.filter(s => Number(s.lines_due)).map(s => `${s.code} OTIF ${s.otif_pct}% quality ${s.quality_pct}%`).join(' · '));
ok(ct.otif.pct > 50 && ct.otif.pct < 100, 'customer OTIF reflects late and damaged deliveries');
const jym = ct.suppliers.find(s => s.code === 'SUP-JYM'), bpk = ct.suppliers.find(s => s.code === 'SUP-BPK');
ok(jym.otif_pct < bpk.otif_pct, `supplier OTIF separates late Jyoti Motors (${jym.otif_pct}%) from always-on-time Bharat Packaging (${bpk.otif_pct}%)`);
const neg = await sql(`SELECT COUNT(*) AS n FROM stock WHERE on_hand < 0 OR reserved > on_hand`);
const recon = await sql(`SELECT COUNT(*) AS n FROM stock s WHERE on_hand <> (SELECT COALESCE(SUM(qty),0) FROM stock_moves m WHERE m.item_id=s.item_id AND m.location_id=s.location_id)`);
ok(Number(neg[0].n) === 0 && Number(recon[0].n) === 0, 'every stock balance equals the sum of its movement ledger; nothing negative or over-reserved');
console.log(`DONE — ${checks} checks passed`);
await db.end();
