-- ChainPilot demo data — Shakti Home Appliances: fan plant at Bhopal, regional warehouses, depot, suppliers, distributors
INSERT INTO organizations(name, gstin, state_code, address) VALUES
 ('Shakti Home Appliances Pvt Ltd', '23AAKCS4821M1Z6', '23', 'Plot 14, Industrial Area Govindpura, Bhopal, MP 462023');

INSERT INTO users(name, email, phone, password_hash, last_org_id) VALUES
 ('Vikram Shah (Director)',        'admin@scm.local',     '9800000001', crypt('Admin@123', gen_salt('bf',10)), 1),
 ('Priya Menon (SCM Head)',        'scm@scm.local',       '9800000002', crypt('Admin@123', gen_salt('bf',10)), 1),
 ('Rohit Jain (Demand Planner)',   'planner@scm.local',   '9800000003', crypt('Admin@123', gen_salt('bf',10)), 1),
 ('Kavya Nair (Buyer)',            'buyer@scm.local',     '9800000004', crypt('Admin@123', gen_salt('bf',10)), 1),
 ('Imran Khan (Plant Stores)',     'stores@scm.local',    '9800000005', crypt('Admin@123', gen_salt('bf',10)), 1),
 ('Neha Gupta (Delhi WH)',         'whdel@scm.local',     '9800000006', crypt('Admin@123', gen_salt('bf',10)), 1),
 ('Sanjay Verma (Logistics)',      'logistics@scm.local', '9800000007', crypt('Admin@123', gen_salt('bf',10)), 1),
 ('Ramesh Yadav (Driver)',         'driver@scm.local',    '9800000008', crypt('Admin@123', gen_salt('bf',10)), 1),
 ('Suresh Patil (Driver)',         'driver2@scm.local',   '9800000009', crypt('Admin@123', gen_salt('bf',10)), 1),
 ('Auditor (Read only)',           'viewer@scm.local',    '9800000010', crypt('Admin@123', gen_salt('bf',10)), 1);

INSERT INTO locations(org_id, code, name, type, city, state_code, supply_from, transit_days) VALUES
 (1, 'PLT-BPL', 'Bhopal Plant',              'PLANT',     'Bhopal',    '23', NULL, 0),
 (1, 'WH-DEL',  'Delhi Regional Warehouse',  'WAREHOUSE', 'Delhi',     '07', 1, 3),
 (1, 'WH-MUM',  'Mumbai Regional Warehouse', 'WAREHOUSE', 'Bhiwandi',  '27', 1, 3),
 (1, 'WH-BLR',  'Bengaluru Warehouse',       'WAREHOUSE', 'Bengaluru', '29', 1, 5),
 (1, 'DEP-PUN', 'Pune Depot',                'DEPOT',     'Pune',      '27', 3, 1);

INSERT INTO memberships(org_id, user_id, role, location_id) VALUES
 (1,1,'ADMIN',NULL),(1,2,'MANAGER',NULL),(1,3,'PLANNER',NULL),(1,4,'BUYER',NULL),(1,5,'WAREHOUSE',1),(1,6,'WAREHOUSE',2),
 (1,7,'LOGISTICS',NULL),(1,8,'DRIVER',1),(1,9,'DRIVER',3),(1,10,'VIEWER',NULL);

-- finished goods (made at the plant), traded goods, components and packing
INSERT INTO items(org_id, code, name, uom, type, make_buy, hsn, gst_rate, lead_time_days, moq, lot_multiple, std_cost, avg_cost, sale_price, weight_kg, service_level) VALUES
 (1,'FAN-1200','Ceiling fan 1200 mm "Breeze"', 'NOS','FINISHED','MAKE','84145120',18, 5, 200, 50, 1180, 1180, 1890, 4.8, 97.5),
 (1,'FAN-900', 'Ceiling fan 900 mm "Compact"', 'NOS','FINISHED','MAKE','84145120',18, 5, 100, 50,  990,  990, 1590, 4.1, 95),
 (1,'FAN-PED', 'Pedestal fan 400 mm "Tornado"','NOS','FINISHED','MAKE','84145190',18, 7, 100, 25, 1350, 1350, 2290, 7.2, 95),
 (1,'LED-9W',  'LED bulb 9 W (box of 10)',     'BOX','TRADED',  'BUY', '85395000',12,10, 100, 50,  420,  420,  690, 0.9, 95),
 (1,'MTR-1200','Motor assembly 1200 mm',       'NOS','COMPONENT','BUY','85015290',18,21, 500,100,  640,  640,    0, 2.6, 98),
 (1,'MTR-900', 'Motor assembly 900 mm',        'NOS','COMPONENT','BUY','85015290',18,21, 300,100,  560,  560,    0, 2.2, 98),
 (1,'MTR-400', 'Motor pedestal 400 mm',        'NOS','COMPONENT','BUY','85015290',18,21, 300,100,  610,  610,    0, 2.4, 98),
 (1,'BLD-1200','Blade set 1200 mm (3 pcs)',    'SET','COMPONENT','BUY','84149090',18,14, 500,100,  150,  150,    0, 0.9, 95),
 (1,'BLD-900', 'Blade set 900 mm (3 pcs)',     'SET','COMPONENT','BUY','84149090',18,14, 300,100,  120,  120,    0, 0.7, 95),
 (1,'CAN-01',  'Canopy & down-rod kit',        'SET','COMPONENT','BUY','84149090',18,14, 500,100,   95,   95,    0, 0.6, 95),
 (1,'CAP-25',  'Capacitor 2.5 µF',             'NOS','COMPONENT','BUY','85322500',18, 7,1000,500,   18,   18,    0, 0.05,95),
 (1,'GRL-400', 'Guard grill 400 mm',           'SET','COMPONENT','BUY','73269099',18,14, 300,100,  140,  140,    0, 1.1, 95),
 (1,'STD-PED', 'Pedestal stand kit',           'SET','COMPONENT','BUY','73269099',18,14, 300,100,  210,  210,    0, 2.8, 95),
 (1,'BOX-L',   'Carton — ceiling fan large',   'NOS','PACKING', 'BUY', '48191010',12, 5,1000,500,   38,   38,    0, 0.4, 95),
 (1,'BOX-S',   'Carton — ceiling fan small',   'NOS','PACKING', 'BUY', '48191010',12, 5,1000,500,   32,   32,    0, 0.35,95),
 (1,'BOX-P',   'Carton — pedestal fan',        'NOS','PACKING', 'BUY', '48191010',12, 5, 500,250,   55,   55,    0, 0.6, 95);

INSERT INTO bom_lines(parent_id, component_id, qty_per, scrap_pct) VALUES
 (1,5,1,0),(1,8,1,1),(1,10,1,0),(1,11,1,0.5),(1,14,1,0),
 (2,6,1,0),(2,9,1,1),(2,10,1,0),(2,11,1,0.5),(2,15,1,0),
 (3,7,1,0),(3,12,1,1),(3,13,1,0),(3,11,1,0.5),(3,16,1,0);

-- stocking points: finished & traded goods at every location; components only at the plant
INSERT INTO item_locations(item_id, location_id) SELECT i.id, l.id FROM items i CROSS JOIN locations l WHERE i.type IN ('FINISHED','TRADED');
INSERT INTO item_locations(item_id, location_id) SELECT i.id, 1 FROM items i WHERE i.type IN ('COMPONENT','PACKING');

INSERT INTO suppliers(org_id, code, name, gstin, state_code, city, email, phone, payment_terms_days, status) VALUES
 (1,'SUP-JYM','Jyoti Motors Pvt Ltd',        '24AABCJ7781K1Z2','24','Rajkot',   'sales@jyotimotors.example',   '9825000001',45,'APPROVED'),
 (1,'SUP-APX','Apex Electric Motors',        '06AAFCA5521E1Z9','06','Faridabad','orders@apexmotors.example',   '9811000002',30,'APPROVED'),
 (1,'SUP-KVP','Kaveri Pressings',            '27AAGFK3312B1Z4','27','Pune',     'kaveri@pressings.example',    '9822000003',30,'APPROVED'),
 (1,'SUP-SHC','Shree Capacitors',            '23AAHFS9002Q1Z1','23','Indore',   'shree@capacitors.example',    '9893000004',30,'APPROVED'),
 (1,'SUP-BPK','Bharat Packaging Industries', '23AAEFB4410L1Z8','23','Bhopal',   'bpi@packaging.example',       '9826000005',15,'APPROVED'),
 (1,'SUP-LUM','Lumina Lighting LLP',         '07AAPFL6620H1Z3','07','Delhi',    'trade@lumina.example',        '9810000006',30,'CONDITIONAL'),
 (1,'SUP-NOV','Nova Metal Works',            '23AAJFN1180C1Z5','23','Pithampur','nova@metalworks.example',     '9893000007',30,'BLOCKED');

INSERT INTO supplier_items(supplier_id, item_id, price, lead_time_days, moq, preferred) VALUES
 (1,5,640,21,500,TRUE),(1,6,560,21,300,TRUE),(1,7,610,21,300,TRUE),
 (2,5,655,14,300,FALSE),(2,6,575,14,300,FALSE),(2,7,620,14,300,FALSE),
 (3,8,150,14,500,TRUE),(3,9,120,14,300,TRUE),(3,10,95,14,500,TRUE),(3,12,140,14,300,TRUE),(3,13,210,14,300,TRUE),
 (4,11,18,7,1000,TRUE),
 (5,14,38,5,1000,TRUE),(5,15,32,5,1000,TRUE),(5,16,55,5,500,TRUE),
 (6,4,420,10,100,TRUE),
 (7,12,128,10,300,FALSE),(7,13,195,10,300,FALSE);

INSERT INTO customers(org_id, code, name, gstin, state_code, city, channel, ship_from) VALUES
 (1,'C-BPL01','Malwa Electricals',            '23AACFM1001A1Z1','23','Bhopal',    'DISTRIBUTOR',1),
 (1,'C-IND01','Indore Home Appliances',       '23AADFI2002B1Z2','23','Indore',    'DISTRIBUTOR',1),
 (1,'C-DEL01','Capital Fans & Lights',        '07AAECC3003C1Z3','07','Delhi',     'DISTRIBUTOR',2),
 (1,'C-NOI01','Noida Electric Mart',          '09AAFCN4004D1Z4','09','Noida',     'DISTRIBUTOR',2),
 (1,'C-JAI01','Pink City Distributors',       '08AAGCP5005E1Z5','08','Jaipur',    'DISTRIBUTOR',2),
 (1,'C-MUM01','Bombay Electric Co',           '27AAHCB6006F1Z6','27','Mumbai',    'DISTRIBUTOR',3),
 (1,'C-THN01','Thane Appliance Hub',          '27AAJCT7007G1Z7','27','Thane',     'RETAIL',     3),
 (1,'C-PUN01','Deccan Electricals',           '27AAKCD8008H1Z8','27','Pune',      'DISTRIBUTOR',5),
 (1,'C-BLR01','Garden City Distributors',     '29AALCG9009J1Z9','29','Bengaluru', 'DISTRIBUTOR',4),
 (1,'C-MYS01','Mysuru Electric Stores',       '29AAMCM1010K1Z1','29','Mysuru',    'RETAIL',     4),
 (1,'C-ECM01','Shopmart Online (e-commerce)', '29AANCS1111L1Z2','29','Bengaluru', 'E-COMMERCE', 4);

INSERT INTO transporters(org_id, name, gstin, phone, rate_per_kg, min_charge) VALUES
 (1,'VRL Logistics',   '29AABCV3609C1ZJ','9845000101',6.5,2500),
 (1,'Safexpress',      '07AAECS2264B1Z1','9810000102',8.0,1800),
 (1,'Local Tempo (own)',NULL,              '9826000103',3.0, 600);
INSERT INTO vehicles(org_id, transporter_id, reg_no, type, capacity_kg) VALUES
 (1,1,'KA01AB4521','32 ft container',9000),(1,1,'MP04GA7710','20 ft truck',5000),(1,2,'DL01LT3302','14 ft truck',2500),
 (1,3,'MP04T1188','Tata Ace',750),(1,3,'MH12QW5521','Eicher 14 ft',2500);

-- opening stock (moves feed the balances through the trigger)
INSERT INTO stock_moves(org_id, item_id, location_id, qty, type, unit_cost, ref_type, ref_no, move_date, user_id, note)
SELECT 1, i.id, l.id, q.qty, 'OPENING', i.std_cost, 'OPENING', 'OPENING', CURRENT_DATE - 60, 1, 'Opening balance at go-live'
  FROM (VALUES
   ('FAN-1200','PLT-BPL',900),('FAN-1200','WH-DEL',700),('FAN-1200','WH-MUM',520),('FAN-1200','WH-BLR',430),('FAN-1200','DEP-PUN',160),
   ('FAN-900','PLT-BPL',380),('FAN-900','WH-DEL',260),('FAN-900','WH-MUM',300),('FAN-900','WH-BLR',140),('FAN-900','DEP-PUN',90),
   ('FAN-PED','PLT-BPL',420),('FAN-PED','WH-DEL',360),('FAN-PED','WH-MUM',240),('FAN-PED','WH-BLR',150),('FAN-PED','DEP-PUN',60),
   ('LED-9W','PLT-BPL',300),('LED-9W','WH-DEL',220),('LED-9W','WH-MUM',190),('LED-9W','WH-BLR',260),('LED-9W','DEP-PUN',80),
   ('MTR-1200','PLT-BPL',1600),('MTR-900','PLT-BPL',700),('MTR-400','PLT-BPL',900),('BLD-1200','PLT-BPL',1900),('BLD-900','PLT-BPL',800),
   ('CAN-01','PLT-BPL',2600),('CAP-25','PLT-BPL',5200),('GRL-400','PLT-BPL',820),('STD-PED','PLT-BPL',760),
   ('BOX-L','PLT-BPL',2200),('BOX-S','PLT-BPL',1400),('BOX-P','PLT-BPL',900)
  ) AS q(code, loc, qty) JOIN items i ON i.code = q.code AND i.org_id = 1 JOIN locations l ON l.code = q.loc AND l.org_id = 1;
