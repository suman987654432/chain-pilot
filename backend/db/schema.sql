-- =====================================================================
--  ChainPilot — Supply Chain Management
--  Demand forecasting · Safety stock & ROP · MRP / DRP · Procurement (PR → RFQ → PO → GRN)
--  Sales orders & ATP · Shipments & proof of delivery · Inter-location transfers · Control tower
--  PostgreSQL 14+
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE scm_role      AS ENUM ('ADMIN','MANAGER','PLANNER','BUYER','WAREHOUSE','LOGISTICS','DRIVER','VIEWER');
CREATE TYPE loc_type      AS ENUM ('PLANT','WAREHOUSE','DEPOT');
CREATE TYPE item_type     AS ENUM ('RAW','COMPONENT','FINISHED','TRADED','PACKING');
CREATE TYPE make_buy      AS ENUM ('MAKE','BUY');
CREATE TYPE move_type     AS ENUM ('OPENING','GRN','PRODUCTION_IN','CONSUMPTION','DISPATCH','TRANSFER_OUT','TRANSFER_IN','TRANSIT_LOSS','ADJUSTMENT','RETURN');
CREATE TYPE pr_status     AS ENUM ('DRAFT','SUBMITTED','APPROVED','REJECTED','RFQ','ORDERED','CANCELLED');
CREATE TYPE rfq_status    AS ENUM ('OPEN','CLOSED','AWARDED','CANCELLED');
CREATE TYPE po_status     AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','PARTIAL','RECEIVED','CLOSED','CANCELLED','REJECTED');
CREATE TYPE so_status     AS ENUM ('OPEN','ALLOCATED','PARTIAL','DISPATCHED','DELIVERED','CANCELLED');
CREATE TYPE ship_type     AS ENUM ('SALES','TRANSFER');
CREATE TYPE ship_status   AS ENUM ('PLANNED','DISPATCHED','DELIVERED','PARTIAL','CANCELLED');
CREATE TYPE stop_status   AS ENUM ('PENDING','DELIVERED','PARTIAL','FAILED');
CREATE TYPE to_status     AS ENUM ('DRAFT','RELEASED','DISPATCHED','RECEIVED','CANCELLED');
CREATE TYPE mo_status     AS ENUM ('PLANNED','RELEASED','COMPLETED','CANCELLED');
CREATE TYPE plan_kind     AS ENUM ('BUY','MAKE','TRANSFER');
CREATE TYPE plan_status   AS ENUM ('OPEN','CONVERTED','DISMISSED');
CREATE TYPE supplier_status AS ENUM ('APPROVED','CONDITIONAL','BLOCKED');

-- ---------- Organisation & users ----------------------------------------------
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, gstin TEXT, state_code CHAR(2), address TEXT,
  -- purchase-approval matrix (₹, PO value incl. GST): ≤ auto_limit released by buyer; ≤ manager_limit by MANAGER; above → ADMIN
  po_auto_limit NUMERIC(14,2) NOT NULL DEFAULT 100000, po_manager_limit NUMERIC(14,2) NOT NULL DEFAULT 1000000,
  grn_tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 5,          -- over-receipt allowed vs PO qty
  eway_bill_limit NUMERIC(14,2) NOT NULL DEFAULT 50000,       -- consignment value needing an e-way bill
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, phone TEXT,
  last_org_id INT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role scm_role NOT NULL, location_id INT,                       -- warehouse users / drivers can be tied to a home location
  PRIMARY KEY (org_id, user_id)
);

-- ---------- Network ----------------------------------------------------------
CREATE TABLE locations (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, type loc_type NOT NULL, city TEXT, state_code CHAR(2) NOT NULL,
  supply_from INT REFERENCES locations(id),                     -- DRP network: replenished from this location (NULL = supplier / own production)
  transit_days INT NOT NULL DEFAULT 2 CHECK (transit_days >= 0), -- lead time from supply_from
  active BOOLEAN NOT NULL DEFAULT TRUE, UNIQUE (org_id, code),
  CHECK (supply_from IS NULL OR supply_from <> id)
);
ALTER TABLE memberships ADD FOREIGN KEY (location_id) REFERENCES locations(id);

-- ---------- Items, BOM, sources -------------------------------------------------
CREATE TABLE items (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, uom TEXT NOT NULL DEFAULT 'NOS', type item_type NOT NULL, make_buy make_buy NOT NULL,
  hsn TEXT, gst_rate NUMERIC(5,2) NOT NULL DEFAULT 18 CHECK (gst_rate IN (0,5,12,18,28,40)),
  lead_time_days INT NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),   -- purchase or production lead time
  moq NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (moq > 0), lot_multiple NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (lot_multiple > 0),
  std_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (std_cost >= 0), avg_cost NUMERIC(14,4) NOT NULL DEFAULT 0,  -- moving average (updated on GRN)
  sale_price NUMERIC(14,2) NOT NULL DEFAULT 0, weight_kg NUMERIC(10,3) NOT NULL DEFAULT 0,
  service_level NUMERIC(5,2) NOT NULL DEFAULT 95 CHECK (service_level BETWEEN 50 AND 99.9),
  active BOOLEAN NOT NULL DEFAULT TRUE, UNIQUE (org_id, code)
);
CREATE TABLE bom_lines (
  id SERIAL PRIMARY KEY, parent_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  component_id INT NOT NULL REFERENCES items(id), qty_per NUMERIC(14,4) NOT NULL CHECK (qty_per > 0),
  scrap_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (scrap_pct >= 0 AND scrap_pct < 50),
  UNIQUE (parent_id, component_id), CHECK (parent_id <> component_id)
);
-- item × location planning policy (stocking point). Safety stock / ROP are recalculated by each planning run unless fixed.
CREATE TABLE item_locations (
  item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE, location_id INT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  safety_stock NUMERIC(14,3) NOT NULL DEFAULT 0, reorder_point NUMERIC(14,3) NOT NULL DEFAULT 0, fixed_ss BOOLEAN NOT NULL DEFAULT FALSE,
  avg_daily_demand NUMERIC(14,4) NOT NULL DEFAULT 0, abc CHAR(1), xyz CHAR(1),
  PRIMARY KEY (item_id, location_id)
);

CREATE TABLE suppliers (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, gstin TEXT, state_code CHAR(2) NOT NULL, city TEXT, email TEXT, phone TEXT,
  payment_terms_days INT NOT NULL DEFAULT 30, status supplier_status NOT NULL DEFAULT 'APPROVED', UNIQUE (org_id, code)
);
-- approved source list: who can supply what, at what price and lead time
CREATE TABLE supplier_items (
  supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE, item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  price NUMERIC(14,2) NOT NULL CHECK (price > 0), lead_time_days INT NOT NULL CHECK (lead_time_days >= 0), moq NUMERIC(14,3) NOT NULL DEFAULT 1,
  preferred BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY (supplier_id, item_id)
);
CREATE UNIQUE INDEX one_preferred_source ON supplier_items(item_id) WHERE preferred;

CREATE TABLE customers (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, gstin TEXT, state_code CHAR(2) NOT NULL, city TEXT, address TEXT, phone TEXT,
  channel TEXT NOT NULL DEFAULT 'DISTRIBUTOR', ship_from INT REFERENCES locations(id), UNIQUE (org_id, code)
);
CREATE TABLE transporters (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, gstin TEXT, phone TEXT, rate_per_kg NUMERIC(10,2) NOT NULL DEFAULT 0, min_charge NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE TABLE vehicles (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, transporter_id INT REFERENCES transporters(id),
  reg_no TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'TRUCK', capacity_kg NUMERIC(10,1) NOT NULL CHECK (capacity_kg > 0), UNIQUE (org_id, reg_no)
);

-- ---------- Inventory: balances + immutable movement ledger -------------------
CREATE TABLE stock (
  item_id INT NOT NULL REFERENCES items(id), location_id INT NOT NULL REFERENCES locations(id),
  on_hand NUMERIC(14,3) NOT NULL DEFAULT 0, reserved NUMERIC(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, location_id),
  CONSTRAINT stock_not_negative CHECK (on_hand >= 0),
  CONSTRAINT reserved_within_stock CHECK (reserved >= 0 AND reserved <= on_hand)
);
CREATE TABLE stock_moves (
  id BIGSERIAL PRIMARY KEY, org_id INT NOT NULL, item_id INT NOT NULL REFERENCES items(id), location_id INT NOT NULL REFERENCES locations(id),
  qty NUMERIC(14,3) NOT NULL CHECK (qty <> 0), type move_type NOT NULL, unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  ref_type TEXT, ref_id INT, ref_no TEXT, move_date DATE NOT NULL DEFAULT CURRENT_DATE, user_id INT, note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON stock_moves(org_id, item_id, location_id, move_date);

-- every movement updates the balance; a shortage raises a clear error and rolls back the whole document
CREATE OR REPLACE FUNCTION apply_move() RETURNS trigger AS $$
DECLARE bal NUMERIC; res NUMERIC; ic TEXT; lc TEXT;
BEGIN
  INSERT INTO stock(item_id, location_id, on_hand) VALUES (NEW.item_id, NEW.location_id, 0) ON CONFLICT DO NOTHING;
  SELECT on_hand, reserved INTO bal, res FROM stock WHERE item_id=NEW.item_id AND location_id=NEW.location_id FOR UPDATE;
  -- stock reserved for orders cannot be consumed by anything else (dispatch releases its reservation before moving stock)
  IF bal + NEW.qty < res THEN
    SELECT code INTO ic FROM items WHERE id=NEW.item_id; SELECT code INTO lc FROM locations WHERE id=NEW.location_id;
    RAISE EXCEPTION '%', format('Insufficient stock of %s at %s: free %s, required %s%s', ic, lc, (bal - res)::float8, (-NEW.qty)::float8,
      CASE WHEN res > 0 THEN ' (' || res::float8 || ' reserved for orders)' ELSE '' END) USING ERRCODE = '23514';
  END IF;
  UPDATE stock SET on_hand = on_hand + NEW.qty WHERE item_id=NEW.item_id AND location_id=NEW.location_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_apply_move AFTER INSERT ON stock_moves FOR EACH ROW EXECUTE FUNCTION apply_move();
CREATE OR REPLACE FUNCTION moves_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.qty <> OLD.qty OR NEW.item_id <> OLD.item_id OR NEW.location_id <> OLD.location_id THEN
    RAISE EXCEPTION 'Stock movements cannot be changed — post an adjustment instead' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_moves_immutable BEFORE UPDATE OR DELETE ON stock_moves FOR EACH ROW EXECUTE FUNCTION moves_immutable();

-- ---------- Demand ----------------------------------------------------------------
-- monthly demand history per item × location (imported from the legacy system, then fed by every dispatch)
CREATE TABLE demand_history (
  item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE, location_id INT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  period DATE NOT NULL CHECK (EXTRACT(DAY FROM period) = 1), qty NUMERIC(14,3) NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (item_id, location_id, period)
);
CREATE TABLE forecasts (
  item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE, location_id INT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  period DATE NOT NULL, system_qty NUMERIC(14,3) NOT NULL, override_qty NUMERIC(14,3), override_note TEXT, override_by INT REFERENCES users(id),
  method TEXT NOT NULL, mape NUMERIC(8,2), PRIMARY KEY (item_id, location_id, period)
);

-- ---------- Planning ---------------------------------------------------------------
CREATE TABLE plan_runs (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(), run_by INT REFERENCES users(id), start_week DATE NOT NULL, weeks INT NOT NULL,
  summary JSONB
);
CREATE TABLE plan_items (                                          -- time-phased MRP / DRP record per item × location
  run_id INT NOT NULL REFERENCES plan_runs(id) ON DELETE CASCADE, item_id INT NOT NULL REFERENCES items(id), location_id INT NOT NULL REFERENCES locations(id),
  source TEXT NOT NULL, on_hand NUMERIC(14,3) NOT NULL, safety_stock NUMERIC(14,3) NOT NULL, reorder_point NUMERIC(14,3) NOT NULL,
  grid JSONB NOT NULL, exceptions TEXT[] NOT NULL DEFAULT '{}', PRIMARY KEY (run_id, item_id, location_id)
);
CREATE TABLE planned_orders (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL, run_id INT NOT NULL REFERENCES plan_runs(id) ON DELETE CASCADE,
  kind plan_kind NOT NULL, item_id INT NOT NULL REFERENCES items(id), location_id INT NOT NULL REFERENCES locations(id),
  source_location_id INT REFERENCES locations(id), supplier_id INT REFERENCES suppliers(id),
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0), release_date DATE NOT NULL, need_date DATE NOT NULL, past_due BOOLEAN NOT NULL DEFAULT FALSE,
  status plan_status NOT NULL DEFAULT 'OPEN', converted_ref TEXT
);

-- ---------- Procurement --------------------------------------------------------------
CREATE TABLE purchase_requisitions (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, pr_no TEXT NOT NULL,
  location_id INT NOT NULL REFERENCES locations(id), need_date DATE NOT NULL, status pr_status NOT NULL DEFAULT 'DRAFT',
  source TEXT NOT NULL DEFAULT 'MANUAL', remarks TEXT, requested_by INT REFERENCES users(id), approved_by INT REFERENCES users(id), approved_at TIMESTAMPTZ,
  reject_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (org_id, pr_no)
);
CREATE TABLE pr_lines (
  id SERIAL PRIMARY KEY, pr_id INT NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE, item_id INT NOT NULL REFERENCES items(id),
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0), est_price NUMERIC(14,2) NOT NULL DEFAULT 0, planned_order_id INT REFERENCES planned_orders(id)
);
CREATE TABLE rfqs (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, rfq_no TEXT NOT NULL,
  pr_id INT REFERENCES purchase_requisitions(id), location_id INT NOT NULL REFERENCES locations(id), due_date DATE NOT NULL, need_date DATE NOT NULL,
  status rfq_status NOT NULL DEFAULT 'OPEN', award_note TEXT, created_by INT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (org_id, rfq_no)
);
CREATE TABLE rfq_lines (
  id SERIAL PRIMARY KEY, rfq_id INT NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE, item_id INT NOT NULL REFERENCES items(id), qty NUMERIC(14,3) NOT NULL CHECK (qty > 0)
);
CREATE TABLE rfq_suppliers (
  rfq_id INT NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE, supplier_id INT NOT NULL REFERENCES suppliers(id), PRIMARY KEY (rfq_id, supplier_id)
);
CREATE TABLE quotes (
  id SERIAL PRIMARY KEY, rfq_id INT NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE, supplier_id INT NOT NULL REFERENCES suppliers(id),
  rfq_line_id INT NOT NULL REFERENCES rfq_lines(id) ON DELETE CASCADE, price NUMERIC(14,2) NOT NULL CHECK (price > 0),
  lead_time_days INT NOT NULL CHECK (lead_time_days >= 0), freight NUMERIC(14,2) NOT NULL DEFAULT 0, payment_terms_days INT NOT NULL DEFAULT 30,
  valid_until DATE, awarded BOOLEAN NOT NULL DEFAULT FALSE, UNIQUE (rfq_line_id, supplier_id)
);
CREATE TABLE purchase_orders (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, po_no TEXT NOT NULL,
  supplier_id INT NOT NULL REFERENCES suppliers(id), location_id INT NOT NULL REFERENCES locations(id),
  po_date DATE NOT NULL DEFAULT CURRENT_DATE, expected_date DATE NOT NULL, status po_status NOT NULL DEFAULT 'DRAFT',
  tax_type TEXT NOT NULL CHECK (tax_type IN ('INTRA','INTER')), subtotal NUMERIC(14,2) NOT NULL DEFAULT 0, freight NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst NUMERIC(14,2) NOT NULL DEFAULT 0, sgst NUMERIC(14,2) NOT NULL DEFAULT 0, igst NUMERIC(14,2) NOT NULL DEFAULT 0, total NUMERIC(14,2) NOT NULL DEFAULT 0,
  approval_level TEXT, price_flags TEXT[] NOT NULL DEFAULT '{}', rfq_id INT REFERENCES rfqs(id), pr_id INT REFERENCES purchase_requisitions(id),
  payment_terms_days INT NOT NULL DEFAULT 30, notes TEXT, created_by INT REFERENCES users(id), approved_by INT REFERENCES users(id), approved_at TIMESTAMPTZ,
  reject_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (org_id, po_no)
);
CREATE TABLE po_lines (
  id SERIAL PRIMARY KEY, po_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE, item_id INT NOT NULL REFERENCES items(id),
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0), price NUMERIC(14,2) NOT NULL CHECK (price > 0), gst_rate NUMERIC(5,2) NOT NULL,
  received_qty NUMERIC(14,3) NOT NULL DEFAULT 0, accepted_qty NUMERIC(14,3) NOT NULL DEFAULT 0, rejected_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  planned_order_id INT REFERENCES planned_orders(id), CHECK (accepted_qty + rejected_qty = received_qty)
);
CREATE TABLE grns (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, grn_no TEXT NOT NULL,
  po_id INT NOT NULL REFERENCES purchase_orders(id), location_id INT NOT NULL REFERENCES locations(id), received_on DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_invoice TEXT, vehicle_no TEXT, remarks TEXT, received_by INT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (org_id, grn_no)
);
CREATE TABLE grn_lines (
  id SERIAL PRIMARY KEY, grn_id INT NOT NULL REFERENCES grns(id) ON DELETE CASCADE, po_line_id INT NOT NULL REFERENCES po_lines(id),
  received_qty NUMERIC(14,3) NOT NULL CHECK (received_qty > 0), accepted_qty NUMERIC(14,3) NOT NULL CHECK (accepted_qty >= 0),
  rejected_qty NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0), reject_reason TEXT, CHECK (accepted_qty + rejected_qty = received_qty)
);

-- ---------- Production (make items) -------------------------------------------------------
CREATE TABLE production_orders (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, mo_no TEXT NOT NULL,
  item_id INT NOT NULL REFERENCES items(id), location_id INT NOT NULL REFERENCES locations(id), qty NUMERIC(14,3) NOT NULL CHECK (qty > 0),
  due_date DATE NOT NULL, status mo_status NOT NULL DEFAULT 'PLANNED', completed_qty NUMERIC(14,3) NOT NULL DEFAULT 0, completed_on DATE,
  planned_order_id INT REFERENCES planned_orders(id), created_by INT REFERENCES users(id), UNIQUE (org_id, mo_no)
);

-- ---------- Sales & logistics ---------------------------------------------------------
CREATE TABLE sales_orders (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, so_no TEXT NOT NULL,
  customer_id INT NOT NULL REFERENCES customers(id), location_id INT NOT NULL REFERENCES locations(id),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE, promised_date DATE NOT NULL, status so_status NOT NULL DEFAULT 'OPEN', priority INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  customer_po TEXT, total NUMERIC(14,2) NOT NULL DEFAULT 0, created_by INT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (org_id, so_no),
  CHECK (promised_date >= order_date)
);
CREATE TABLE so_lines (
  id SERIAL PRIMARY KEY, so_id INT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE, item_id INT NOT NULL REFERENCES items(id),
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0), price NUMERIC(14,2) NOT NULL CHECK (price >= 0), gst_rate NUMERIC(5,2) NOT NULL,
  allocated_qty NUMERIC(14,3) NOT NULL DEFAULT 0, shipped_qty NUMERIC(14,3) NOT NULL DEFAULT 0, delivered_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  CHECK (allocated_qty >= 0 AND shipped_qty + allocated_qty <= qty AND delivered_qty <= shipped_qty)
);
CREATE TABLE transfer_orders (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, to_no TEXT NOT NULL,
  from_location_id INT NOT NULL REFERENCES locations(id), to_location_id INT NOT NULL REFERENCES locations(id),
  need_date DATE NOT NULL, status to_status NOT NULL DEFAULT 'DRAFT', planned_order_id INT REFERENCES planned_orders(id),
  created_by INT REFERENCES users(id), received_on DATE, received_by INT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, to_no), CHECK (from_location_id <> to_location_id)
);
CREATE TABLE to_lines (
  id SERIAL PRIMARY KEY, to_id INT NOT NULL REFERENCES transfer_orders(id) ON DELETE CASCADE, item_id INT NOT NULL REFERENCES items(id),
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0), allocated_qty NUMERIC(14,3) NOT NULL DEFAULT 0, shipped_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  received_qty NUMERIC(14,3) NOT NULL DEFAULT 0, short_reason TEXT, CHECK (received_qty <= shipped_qty AND shipped_qty <= qty)
);
CREATE TABLE shipments (
  id SERIAL PRIMARY KEY, org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, shp_no TEXT NOT NULL, type ship_type NOT NULL,
  from_location_id INT NOT NULL REFERENCES locations(id), transfer_order_id INT REFERENCES transfer_orders(id),
  transporter_id INT REFERENCES transporters(id), vehicle_id INT REFERENCES vehicles(id), driver_id INT REFERENCES users(id),
  planned_date DATE NOT NULL DEFAULT CURRENT_DATE, status ship_status NOT NULL DEFAULT 'PLANNED',
  total_weight NUMERIC(12,3) NOT NULL DEFAULT 0, total_value NUMERIC(14,2) NOT NULL DEFAULT 0, freight_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  eway_bill_no TEXT, dispatched_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, created_by INT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, shp_no)
);
CREATE TABLE shipment_stops (
  id SERIAL PRIMARY KEY, shipment_id INT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE, seq INT NOT NULL,
  so_id INT REFERENCES sales_orders(id), to_location_id INT REFERENCES locations(id), status stop_status NOT NULL DEFAULT 'PENDING',
  receiver_name TEXT, pod_photo TEXT, pod_lat NUMERIC(9,6), pod_lng NUMERIC(9,6), delivered_at TIMESTAMPTZ, remarks TEXT,
  CHECK ((so_id IS NULL) <> (to_location_id IS NULL))
);
CREATE TABLE shipment_lines (
  id SERIAL PRIMARY KEY, shipment_id INT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE, stop_id INT NOT NULL REFERENCES shipment_stops(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES items(id), so_line_id INT REFERENCES so_lines(id), to_line_id INT REFERENCES to_lines(id),
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0), delivered_qty NUMERIC(14,3), short_reason TEXT,
  CHECK (delivered_qty IS NULL OR (delivered_qty >= 0 AND delivered_qty <= qty))
);

-- ---------- Numbering & audit ------------------------------------------------------------
CREATE TABLE doc_series (org_id INT NOT NULL, doc_type TEXT NOT NULL, yr INT NOT NULL, last_no INT NOT NULL, PRIMARY KEY (org_id, doc_type, yr));
CREATE OR REPLACE FUNCTION next_no(p_org INT, p_type TEXT) RETURNS TEXT AS $$
DECLARE n INT; y INT := EXTRACT(YEAR FROM CURRENT_DATE);
BEGIN
  INSERT INTO doc_series VALUES (p_org, p_type, y, 1)
  ON CONFLICT (org_id, doc_type, yr) DO UPDATE SET last_no = doc_series.last_no + 1 RETURNING last_no INTO n;
  RETURN p_type || '-' || y || '-' || lpad(n::TEXT, 4, '0');
END $$ LANGUAGE plpgsql;
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY, org_id INT, user_id INT, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Views -------------------------------------------------------------------------
-- in-transit stock between locations (dispatched on a transfer, not yet received)
CREATE VIEW v_in_transit AS
SELECT t.org_id, t.id AS to_id, t.to_no, t.from_location_id, t.to_location_id, l.item_id, (l.shipped_qty - l.received_qty) AS qty
  FROM transfer_orders t JOIN to_lines l ON l.to_id = t.id WHERE t.status = 'DISPATCHED' AND l.shipped_qty > l.received_qty;

-- supplier delivery performance. A PO line is measured once it is complete, closed short, or past its expected date:
--   on time = last receipt on/before the PO expected date · in full = accepted ≥ ordered · OTIF = both
CREATE VIEW v_supplier_performance AS
WITH l AS (
  SELECT po.supplier_id, po.id AS po_id, po.status, po.expected_date, pl.qty, pl.received_qty, pl.accepted_qty, pl.rejected_qty,
         (SELECT MAX(g.received_on) FROM grn_lines gl JOIN grns g ON g.id = gl.grn_id WHERE gl.po_line_id = pl.id) AS last_receipt,
         (pl.accepted_qty >= pl.qty OR po.status IN ('RECEIVED','CLOSED') OR po.expected_date < CURRENT_DATE) AS due
    FROM purchase_orders po JOIN po_lines pl ON pl.po_id = po.id WHERE po.status NOT IN ('DRAFT','CANCELLED','REJECTED','PENDING_APPROVAL'))
SELECT s.id AS supplier_id, s.org_id, s.code, s.name, s.status,
       COUNT(DISTINCT l.po_id) FILTER (WHERE l.received_qty > 0) AS pos_received,
       COUNT(*) FILTER (WHERE l.due) AS lines_due,
       COUNT(*) FILTER (WHERE l.due AND l.last_receipt <= l.expected_date) AS lines_on_time,
       COUNT(*) FILTER (WHERE l.due AND l.accepted_qty >= l.qty) AS lines_in_full,
       COUNT(*) FILTER (WHERE l.due AND l.accepted_qty >= l.qty AND l.last_receipt <= l.expected_date) AS lines_otif,
       COALESCE(SUM(l.received_qty), 0) AS qty_received, COALESCE(SUM(l.rejected_qty), 0) AS qty_rejected,
       COUNT(DISTINCT l.po_id) FILTER (WHERE l.status IN ('APPROVED','PARTIAL') AND l.expected_date < CURRENT_DATE) AS late_open_pos
  FROM suppliers s LEFT JOIN l ON l.supplier_id = s.id
 GROUP BY s.id;
