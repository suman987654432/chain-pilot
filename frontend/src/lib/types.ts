export type Role =
  | 'ADMIN'
  | 'MANAGER'
  | 'PLANNER'
  | 'BUYER'
  | 'WAREHOUSE'
  | 'LOGISTICS'
  | 'DRIVER'
  | 'VIEWER';

export interface UserSession {
  uid: number;
  name: string;
  email: string;
  orgId: number;
  role: Role;
  locationId?: number | null;
}

export interface Organization {
  id: number;
  name: string;
  gstin?: string;
  state_code?: string;
  address?: string;
  po_auto_limit?: number;
  po_manager_limit?: number;
  grn_tolerance_pct?: number;
  eway_bill_limit?: number;
}

export interface Location {
  id: number;
  code: string;
  name: string;
  type: 'PLANT' | 'WAREHOUSE' | 'DEPOT';
  city?: string;
  state_code: string;
  supply_from?: number | null;
  transit_days: number;
  active: boolean;
}

export interface Item {
  id: number;
  code: string;
  name: string;
  uom: string;
  type: 'RAW' | 'COMPONENT' | 'FINISHED' | 'TRADED' | 'PACKING';
  make_buy: 'MAKE' | 'BUY';
  hsn?: string;
  gst_rate: number;
  lead_time_days: number;
  moq: number;
  lot_multiple: number;
  std_cost: number;
  avg_cost: number;
  sale_price: number;
  weight_kg: number;
  service_level: number;
  active: boolean;
  on_hand?: number;
  preferred_supplier?: string;
  bom_lines?: number;
}

export interface ControlTowerData {
  org: string;
  as_of: string;
  inventory: {
    value: number;
    in_transit_value: number;
    in_transit_transfers: number;
    by_location: Array<{
      id: number;
      code: string;
      name: string;
      type: string;
      value: number;
      fg_units: number;
    }>;
    turns: number | null;
  };
  health: Array<{ code: string; health: string; n: number }>;
  otif: {
    stops: number;
    otif: number;
    on_time: number;
    in_full: number;
    pct: number | null;
  };
  fill_rate: number | null;
  supplier_otif: number | null;
  suppliers: Array<{
    supplier_id: number;
    code: string;
    name: string;
    status: string;
    lines_due: number;
    otif_pct: number | null;
    quality_pct: number | null;
    late_open_pos: number;
  }>;
  procurement: {
    pending_approval: number;
    pending_value: number;
    open_pos: number;
    open_value: number;
    late_pos: number;
    prs_to_approve: number;
    open_rfqs: number;
  };
  logistics: {
    planned: number;
    in_transit: number;
    delayed: number;
    freight_30d: number;
    kg_30d: number;
    late_orders: number;
    open_orders: number;
  };
  planning: {
    id: number;
    run_at: string;
    summary: any;
    open_planned: number;
    past_due: number;
    exceptions: Array<{ ex: string; n: number }>;
  };
  forecast: {
    wmape: number | null;
    accuracy: number | null;
    overrides: number;
  };
  risk: Array<{
    code: string;
    name: string;
    location_code: string;
    on_hand: number;
    safety_stock: number;
    avg_daily_demand: number;
    days_cover: number;
    lead_days: number;
  }>;
  trend: Array<{
    label: string;
    period: string;
    actual: number;
    forecast: number;
  }>;
}

