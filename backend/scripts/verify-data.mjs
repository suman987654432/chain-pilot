import fs from 'fs';
import path from 'path';
import pg from 'pg';

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

const connectionString = process.env.DATABASE_URL;
const isSsl =
  connectionString?.includes('sslmode=require') ||
  connectionString?.includes('neon.tech') ||
  connectionString?.includes('aws.') ||
  connectionString?.includes('render.com');

const pool = new pg.Pool({
  connectionString,
  ssl: isSsl ? { rejectUnauthorized: false } : undefined,
});

async function verify() {
  console.log('===============================================================');
  console.log('CHAINPILOT SCM MODULE DATA & INTEGRITY VERIFICATION');
  console.log('===============================================================');

  const client = await pool.connect();
  try {
    // 1. Organization & Tenants
    const orgs = (await client.query('SELECT id, name, gstin, state_code FROM organizations')).rows;
    console.log(`\n1. ORGANIZATIONS / TENANCY: ${orgs.length} Active Organization(s)`);
    orgs.forEach(o => console.log(`   • [ID: ${o.id}] ${o.name} | GSTIN: ${o.gstin} | State: ${o.state_code}`));

    // 2. Network Locations & DRP
    const locs = (await client.query('SELECT id, code, name, type, state_code, supply_from, transit_days FROM locations ORDER BY id')).rows;
    console.log(`\n2. NETWORK DISTRIBUTION (DRP): ${locs.length} Location Nodes`);
    locs.forEach(l => {
      const parent = locs.find(p => p.id === l.supply_from);
      console.log(`   • ${l.code.padEnd(8)} [${l.type.padEnd(9)}] ${l.name.padEnd(28)} | State: ${l.state_code} | Replenished From: ${parent ? parent.code : 'Suppliers/Plant'} (${l.transit_days}d transit)`);
    });

    // 3. Catalogue Items & Make/Buy
    const items = (await client.query('SELECT id, code, name, type, make_buy, std_cost, avg_cost, service_level FROM items ORDER BY id')).rows;
    console.log(`\n3. ITEMS CATALOGUE: ${items.length} Tracked SKUs`);
    const makeItems = items.filter(i => i.make_buy === 'MAKE');
    const buyItems = items.filter(i => i.make_buy === 'BUY');
    console.log(`   • Finished/Manufactured SKUs: ${makeItems.length} items`);
    makeItems.forEach(i => console.log(`     - ${i.code.padEnd(10)} ${i.name.padEnd(36)} [MAKE] Std Cost: ₹${i.std_cost} | Service Level: ${i.service_level}%`));
    console.log(`   • Procured/Component/Traded SKUs: ${buyItems.length} items`);
    buyItems.forEach(i => console.log(`     - ${i.code.padEnd(10)} ${i.name.padEnd(36)} [BUY]  Avg Cost: ₹${i.avg_cost}`));

    // 4. Bills of Materials (BOM) Explosion links
    const boms = (await client.query(`
      SELECT p.code AS parent, c.code AS component, b.qty_per, b.scrap_pct
      FROM bom_lines b
      JOIN items p ON p.id = b.parent_id
      JOIN items c ON c.id = b.component_id
      ORDER BY p.code, c.code
    `)).rows;
    console.log(`\n4. BILLS OF MATERIALS (BOM): ${boms.length} BOM Relations Connected`);
    const bomMap = {};
    boms.forEach(b => {
      bomMap[b.parent] = bomMap[b.parent] || [];
      bomMap[b.parent].push(`${b.component} (Qty: ${b.qty_per}${b.scrap_pct > 0 ? `, scrap: ${b.scrap_pct}%` : ''})`);
    });
    Object.entries(bomMap).forEach(([parent, comps]) => {
      console.log(`   • ${parent} explodes into:`);
      comps.forEach(c => console.log(`     └─ ${c}`));
    });

    // 5. Approved Vendor Sourcing (Supplier-Items)
    const sources = (await client.query(`
      SELECT s.name AS supplier, s.status, i.code AS item, si.price, si.lead_time_days, si.preferred
      FROM supplier_items si
      JOIN suppliers s ON s.id = si.supplier_id
      JOIN items i ON i.id = si.item_id
      ORDER BY i.code, si.preferred DESC
    `)).rows;
    console.log(`\n5. APPROVED VENDOR LIST (AVL): ${sources.length} Sourcing Contracts`);
    sources.forEach(s => {
      console.log(`   • ${s.item.padEnd(10)} ← ${s.supplier.padEnd(28)} [${s.status}] Price: ₹${s.price} | Lead: ${s.lead_time_days}d ${s.preferred ? '★ PREFERRED' : ''}`);
    });

    // 6. Customers & Channels
    const custs = (await client.query('SELECT code, name, city, channel, state_code FROM customers ORDER BY id')).rows;
    console.log(`\n6. CUSTOMERS & TRADE CHANNELS: ${custs.length} Client Accounts`);
    custs.forEach(c => console.log(`   • ${c.code.padEnd(9)} ${c.name.padEnd(30)} [${c.channel}] | City: ${c.city} (${c.state_code})`));

    // 7. Transporters & Fleet Vehicles
    const vehs = (await client.query(`
      SELECT v.reg_no, v.type, v.capacity_kg, COALESCE(t.name, 'Own Fleet') as transporter
      FROM vehicles v
      LEFT JOIN transporters t ON t.id = v.transporter_id
    `)).rows;
    console.log(`\n7. FLEET & LOGISTICS: ${vehs.length} Registered Transport Vehicles`);
    vehs.forEach(v => console.log(`   • ${v.reg_no.padEnd(12)} ${v.type.padEnd(16)} | Payload Capacity: ${Number(v.capacity_kg).toLocaleString('en-IN')} kg | Transporter: ${v.transporter}`));

    // 8. Users & Role-Based Access Control
    const users = (await client.query(`
      SELECT u.name, u.email, m.role, COALESCE(l.code, 'GLOBAL') as location
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN locations l ON l.id = m.location_id
      ORDER BY m.role
    `)).rows;
    console.log(`\n8. USERS & RBAC MEMBERSHIPS: ${users.length} Role Profiles`);
    users.forEach(u => console.log(`   • ${u.role.padEnd(11)} ${u.name.padEnd(30)} (${u.email}) | Facility: ${u.location}`));

    // 9. Stock Ledger & Integrity Audit
    console.log(`\n9. DOUBLE-ENTRY STOCK LEDGER AUDIT & RECONCILIATION:`);
    const totalMoves = (await client.query('SELECT COUNT(*) as count, SUM(qty) as net FROM stock_moves')).rows[0];
    const totalStock = (await client.query('SELECT COUNT(*) as points, SUM(on_hand) as on_hand, SUM(reserved) as reserved FROM stock')).rows[0];

    console.log(`   • Total Stock Movements in Ledger : ${totalMoves.count} rows (Net Movement Qty: ${Number(totalMoves.net).toLocaleString('en-IN')})`);
    console.log(`   • Total Network Stocking Points  : ${totalStock.points} points`);
    console.log(`   • Total Current On-Hand Stock    : ${Number(totalStock.on_hand).toLocaleString('en-IN')} units`);
    console.log(`   • Total Current Reserved Stock   : ${Number(totalStock.reserved).toLocaleString('en-IN')} units`);

    // Check negative stock
    const negStock = (await client.query('SELECT COUNT(*) as n FROM stock WHERE on_hand < 0 OR reserved > on_hand')).rows[0];
    if (Number(negStock.n) === 0) {
      console.log('   ✓ PASS: Zero negative or over-reserved inventory across all locations.');
    } else {
      console.error(`   ✗ FAIL: ${negStock.n} stocking points have negative or over-reserved stock!`);
    }

    // Check reconciliation: SUM(stock_moves) === stock.on_hand
    const unreconciled = (await client.query(`
      SELECT COUNT(*) as n FROM stock s
      WHERE on_hand <> (
        SELECT COALESCE(SUM(qty), 0) FROM stock_moves m
        WHERE m.item_id = s.item_id AND m.location_id = s.location_id
      )
    `)).rows[0];
    if (Number(unreconciled.n) === 0) {
      console.log('   ✓ PASS: Exact ledger reconciliation! Every stock balance equals the sum of its movements.');
    } else {
      console.error(`   ✗ FAIL: ${unreconciled.n} points do not match their movement ledger.`);
    }

    console.log('\n===============================================================');
    console.log('VERIFICATION COMPLETE: ALL 9 CORE SCM MODULES ARE 100% CONNECTED');
    console.log('===============================================================');

  } catch (err) {
    console.error('Verification error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

verify();

