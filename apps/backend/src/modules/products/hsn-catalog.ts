/**
 * Common HSN (goods) and SAC (services, 99xx) codes with typical GST rates.
 * A curated master to power "search HSN by description" — NOT exhaustive and the
 * rate is a typical suggestion (final rate depends on exact classification).
 * Swap-in point for the full FastGST HSN/SAC lookup later (same search shape).
 */
export interface HsnEntry { code: string; description: string; gst: number; type: 'HSN' | 'SAC'; }

const G = (code: string, description: string, gst: number): HsnEntry => ({ code, description, gst, type: 'HSN' });
const S = (code: string, description: string, gst: number): HsnEntry => ({ code, description, gst, type: 'SAC' });

export const HSN_CATALOG: HsnEntry[] = [
  // ── Food & agriculture ──
  G('1006', 'Rice', 5), G('1001', 'Wheat', 0), G('1101', 'Wheat or meslin flour (atta)', 5),
  G('0713', 'Dried leguminous vegetables (pulses, dal)', 0), G('1701', 'Cane or beet sugar', 5),
  G('0901', 'Coffee', 5), G('0902', 'Tea', 5), G('0904', 'Pepper & spices', 5),
  G('0402', 'Milk powder / concentrated milk', 5), G('0405', 'Butter & dairy fats', 12), G('0406', 'Cheese & curd', 12),
  G('1507', 'Edible vegetable oils (soybean, etc.)', 5), G('1517', 'Edible mixtures / margarine', 5),
  G('1905', 'Bread, biscuits, bakery products', 18), G('2106', 'Food preparations n.e.c.', 18),
  G('1704', 'Sugar confectionery (no cocoa)', 18), G('1806', 'Chocolate & cocoa preparations', 18),
  G('0910', 'Ginger, turmeric, other spices', 5), G('0712', 'Dried vegetables', 5),
  // ── Beverages ──
  G('2201', 'Water, mineral & aerated (unsweetened)', 18), G('2202', 'Sweetened/aerated waters, soft drinks', 28),
  G('2009', 'Fruit & vegetable juices', 12),
  // ── Textiles & apparel ──
  G('5205', 'Cotton yarn', 5), G('5208', 'Woven cotton fabrics', 5), G('5407', 'Woven synthetic fabrics', 5),
  G('6109', 'T-shirts, singlets, vests (knitted)', 5), G('6203', "Men's suits, trousers, shirts", 12),
  G('6204', "Women's suits, dresses, skirts", 12), G('6302', 'Bed, table & kitchen linen', 12),
  G('6403', 'Footwear with leather uppers', 18), G('6402', 'Footwear (rubber/plastic)', 18),
  // ── Chemicals ──
  G('3402', 'Soaps, detergents, cleaning preparations', 18), G('3401', 'Soap', 18),
  G('3808', 'Insecticides, fungicides, pesticides', 18), G('3204', 'Synthetic dyes & pigments', 18),
  G('2815', 'Sodium hydroxide (caustic soda)', 18), G('2807', 'Sulphuric acid', 18), G('2811', 'Other inorganic acids', 18),
  G('3105', 'Fertilizers (mineral/chemical)', 5), G('3814', 'Organic solvents & thinners', 18),
  G('3824', 'Prepared binders / chemical products n.e.c.', 18),
  // ── Plastics, rubber, paper ──
  G('3923', 'Plastic packing goods (bottles, containers)', 18), G('3924', 'Plastic tableware & kitchenware', 18),
  G('3926', 'Other articles of plastic', 18), G('4011', 'New pneumatic rubber tyres', 28),
  G('4802', 'Uncoated paper & paperboard', 12), G('4819', 'Cartons, boxes & cases of paper', 18),
  G('4820', 'Registers, notebooks, account books', 18),
  // ── Metals & articles ──
  G('7213', 'Bars & rods of iron/steel (hot-rolled)', 18), G('7214', 'Other bars & rods of iron/steel', 18),
  G('7308', 'Structures of iron or steel', 18), G('7318', 'Screws, bolts, nuts, washers', 18),
  G('7323', 'Table/kitchen articles of iron or steel', 12), G('7610', 'Aluminium structures', 18),
  G('8302', 'Base-metal mountings & fittings', 18),
  // ── Machinery & mechanical appliances ──
  G('84135010', 'Reciprocating positive-displacement pumps (dosing/metering)', 18),
  G('8413', 'Pumps for liquids; liquid elevators', 18),
  G('8414', 'Air/vacuum pumps, compressors, fans', 18), G('8421', 'Centrifuges; filtering/purifying machinery', 18),
  G('8481', 'Taps, cocks, valves for pipes/tanks', 18), G('8483', 'Transmission shafts, gears, bearings', 18),
  G('8419', 'Machinery for heating/cooling (non-domestic)', 18), G('8438', 'Food/drink processing machinery', 18),
  G('8462', 'Metal forming machine tools', 18), G('8467', 'Hand tools, pneumatic/hydraulic', 18),
  // ── Electrical & electronics ──
  G('8517', 'Telephones, smartphones & network apparatus', 18), G('8471', 'Computers & data-processing units', 18),
  G('8528', 'Monitors, projectors & television receivers', 18), G('8544', 'Insulated wire & cable', 18),
  G('8536', 'Electrical switches, relays, connectors (<1000V)', 18), G('8504', 'Transformers, converters, inverters', 18),
  G('8506', 'Primary cells & batteries', 18), G('8507', 'Electric accumulators (batteries)', 18),
  G('9405', 'Lamps & lighting fittings, LED lights', 12), G('8415', 'Air conditioning machines', 28),
  G('8418', 'Refrigerators & freezers', 18), G('8450', 'Washing machines', 18),
  // ── Vehicles, furniture, construction ──
  G('8708', 'Parts & accessories of motor vehicles', 28), G('8714', 'Parts of bicycles/motorcycles', 18),
  G('9403', 'Furniture (other) & parts', 18), G('9401', 'Seats & chairs', 18),
  G('2523', 'Portland/other cement', 28), G('6810', 'Articles of cement/concrete', 18),
  G('6907', 'Ceramic tiles & flags', 18), G('3208', 'Paints & varnishes', 18),
  G('7007', 'Safety glass', 18), G('4418', "Builders' joinery & carpentry of wood", 18),
  // ── Pharma & medical ──
  G('3004', 'Medicaments (packaged doses)', 12), G('3002', 'Blood, vaccines, antisera', 5),
  G('9018', 'Medical/surgical instruments & appliances', 12), G('3005', 'Wadding, gauze, bandages, dressings', 12),
  G('9021', 'Orthopaedic & prosthetic appliances', 5),
  // ── Stationery & misc goods ──
  G('9608', 'Pens, ballpoint & felt-tip', 18), G('4909', 'Printed cards / calendars', 12),
  G('9503', 'Toys, tricycles, puzzles', 12), G('7117', 'Imitation jewellery', 3),
  G('7113', 'Articles of jewellery (precious metal)', 3),

  // ── Services (SAC 99xx) ──
  S('9954', 'Construction services', 18),
  S('995411', 'Construction of residential buildings', 18),
  S('9963', 'Accommodation, food & beverage services', 5),
  S('996331', 'Restaurant services', 5),
  S('9965', 'Goods transport services', 12),
  S('996511', 'Road transport of goods', 12),
  S('9967', 'Supporting services for transport', 18),
  S('9971', 'Financial & related services', 18),
  S('9972', 'Real estate services', 18),
  S('9973', 'Leasing or rental services', 18),
  S('9982', 'Legal & accounting services', 18),
  S('998222', 'Accounting, auditing & bookkeeping', 18),
  S('9983', 'Other professional, technical & business services', 18),
  S('998313', 'Information technology (IT) consulting services', 18),
  S('998314', 'IT design & development services (software)', 18),
  S('9985', 'Support services', 18),
  S('998519', 'Other employment & staffing services', 18),
  S('9987', 'Maintenance, repair & installation services', 18),
  S('998713', 'Maintenance & repair of transport machinery', 18),
  S('9988', 'Manufacturing services on others’ goods (job work)', 18),
  S('9989', 'Other manufacturing / publishing / printing services', 18),
  S('9991', 'Public administration & compulsory social security', 18),
  S('9992', 'Education services', 18),
  S('9993', 'Human health & social care services', 18),
  S('9994', 'Sewage, waste collection & sanitation services', 18),
  S('9995', 'Services of membership organisations', 18),
  S('9996', 'Recreational, cultural & sporting services', 18),
  S('9997', 'Other services (washing, cleaning, beauty, etc.)', 18),
  S('999792', 'Agreeing to do an act / other misc services', 18),
];
