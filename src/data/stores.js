// Orion Mall @ Brigade Gateway — store data.
// Names follow the mall map convention exactly (G/UG/1st from uploaded maps,
// 2nd/3rd from orionmalls.com). Discounts are demo placeholders.
// x,y: digitized from the floor maps — x 0..100 runs left→right along the
// mall's long axis (~200 m), y 0..100 runs north→south across it (~40 m).
// Atriums 1 & 2 hold the escalators and are the only inter-floor connectors.

export const FLOORS = [
  {
    id: 'G',
    short: 'G',
    label: 'Ground Floor',
    stores: [
      { name: 'H&M', category: 'Fashion', discount: 30, x: 8, y: 20 },
      { name: 'NIKE', category: 'Sportswear', discount: null, x: 14, y: 20 },
      { name: 'GUESS', category: 'Fashion', discount: null, x: 18, y: 22 },
      { name: "LEVI'S", category: 'Fashion', discount: 50, x: 24, y: 18 },
      { name: 'MANGO', category: 'Fashion', discount: null, x: 42, y: 20 },
      { name: 'FOSSIL', category: 'Accessories', discount: 20, x: 45, y: 20 },
      { name: 'ONLY', category: 'Fashion', discount: 30, x: 48, y: 20 },
      { name: 'UNIQLO', category: 'Fashion', discount: 30, x: 54, y: 20 },
      { name: "VICTORIA'S SECRET", category: 'Beauty', discount: null, x: 61, y: 22 },
      { name: 'WESTSIDE', category: 'Fashion', discount: null, x: 78, y: 25 },
      { name: 'PUMA', category: 'Sportswear', discount: 40, x: 6, y: 75 },
      { name: 'SEPHORA', category: 'Beauty', discount: 20, x: 16, y: 75 },
      { name: 'ADIDAS', category: 'Sportswear', discount: null, x: 56, y: 78 },
      { name: 'LACOSTE', category: 'Fashion', discount: null, x: 63, y: 78 },
      { name: 'ALDO', category: 'Footwear', discount: 25, x: 28, y: 78 },
      { name: 'SUPERDRY', category: 'Fashion', discount: 40, x: 25, y: 78 },
    ],
  },
  {
    id: 'UG',
    short: 'UG',
    label: 'Upper Ground Floor',
    stores: [
      { name: 'PANTALOONS', category: 'Fashion', discount: 40, x: 8, y: 60 },
      { name: 'SHOPPERS STOP', category: 'Department', discount: null, x: 88, y: 50 },
      { name: 'STARBUCKS', category: 'Cafe', discount: null, x: 47, y: 62 },
      { name: 'SKECHERS', category: 'Footwear', discount: 30, x: 38, y: 78 },
      { name: 'U.S. POLO ASSN.', category: 'Fashion', discount: 25, x: 30, y: 20 },
      { name: 'ASICS', category: 'Sportswear', discount: null, x: 33, y: 20 },
      { name: 'ARROW', category: 'Fashion', discount: 30, x: 52, y: 20 },
      { name: 'BOSE', category: 'Electronics', discount: null, x: 55, y: 22 },
      { name: 'IMAGINE', category: 'Electronics', discount: null, x: 58, y: 20 },
      { name: 'VAN HEUSEN', category: 'Fashion', discount: 25, x: 62, y: 22 },
      { name: 'TITAN', category: 'Accessories', discount: 15, x: 66, y: 20 },
      { name: 'PEPE JEANS', category: 'Fashion', discount: 30, x: 69, y: 22 },
      { name: 'AMERICAN EAGLE', category: 'Fashion', discount: 25, x: 67, y: 78 },
      { name: 'CELIO', category: 'Fashion', discount: null, x: 60, y: 78 },
      { name: 'ALLEN SOLLY', category: 'Fashion', discount: 30, x: 62, y: 78 },
      { name: 'THEOBROMA', category: 'Cafe', discount: null, x: 46, y: 52 },
    ],
  },
  {
    id: 'F1',
    short: '1',
    label: '1st Floor',
    stores: [
      { name: 'MAX', category: 'Fashion', discount: 40, x: 8, y: 30 },
      { name: 'DECATHLON', category: 'Sportswear', discount: null, x: 88, y: 25 },
      { name: 'RELIANCE DIGITAL', category: 'Electronics', discount: null, x: 64, y: 20 },
      { name: 'MINISO', category: 'Lifestyle', discount: 20, x: 36, y: 18 },
      { name: 'SNITCH', category: 'Fashion', discount: 30, x: 58, y: 20 },
      { name: 'NEW ME', category: 'Fashion', discount: 25, x: 20, y: 75 },
      { name: 'LENSKART', category: 'Optics', discount: 30, x: 23, y: 75 },
      { name: 'CROCS', category: 'Footwear', discount: 25, x: 69, y: 25 },
      { name: 'MOTHERCARE', category: 'Kids', discount: null, x: 31, y: 15 },
      { name: 'UNITED COLORS OF BENETTON', category: 'Fashion', discount: 35, x: 53, y: 18 },
      { name: 'BEWAKOOF', category: 'Fashion', discount: 50, x: 55, y: 18 },
      { name: 'FABINDIA', category: 'Ethnic', discount: null, x: 60, y: 75 },
      { name: 'MANYAVAR', category: 'Ethnic', discount: null, x: 80, y: 60 },
      { name: 'ZIVAME', category: 'Innerwear', discount: 30, x: 50, y: 75 },
      { name: 'HOMECENTRE', category: 'Home', discount: 20, x: 8, y: 70 },
      { name: 'METRO SHOES', category: 'Footwear', discount: null, x: 66, y: 75 },
    ],
  },
  {
    id: 'F2',
    short: '2',
    label: '2nd Floor',
    stores: [
      { name: 'PVR', category: 'Cinema', discount: null, x: 50, y: 15 },
      { name: 'KFC', category: 'Food', discount: null, x: 20, y: 70 },
      { name: "McDONALD'S", category: 'Food', discount: null, x: 40, y: 70 },
      { name: 'BURGER KING', category: 'Food', discount: 20, x: 55, y: 70 },
      { name: 'TACO BELL', category: 'Food', discount: null, x: 25, y: 70 },
      { name: 'SUBWAY', category: 'Food', discount: null, x: 45, y: 70 },
      { name: "DOMINO'S PIZZA", category: 'Food', discount: null, x: 35, y: 70 },
      { name: 'WOW MOMO', category: 'Food', discount: null, x: 30, y: 70 },
      { name: "NANDO'S", category: 'Food', discount: null, x: 15, y: 30 },
      { name: "CHILI'S", category: 'Food', discount: null, x: 20, y: 30 },
      { name: 'PIZZA EXPRESS', category: 'Food', discount: 25, x: 25, y: 30 },
      { name: 'PUNJAB GRILL', category: 'Food', discount: null, x: 30, y: 30 },
      { name: 'KAILASH PARBAT', category: 'Food', discount: null, x: 35, y: 30 },
      { name: 'BASKIN ROBBINS', category: 'Food', discount: null, x: 60, y: 70 },
      { name: "HALDIRAM'S", category: 'Food', discount: null, x: 65, y: 70 },
      { name: 'CROSSWORD', category: 'Books', discount: 20, x: 70, y: 30 },
    ],
  },
  {
    id: 'F3',
    short: '3',
    label: '3rd Floor',
    stores: [
      { name: 'PVR', category: 'Cinema', discount: null, x: 50, y: 20 },
      { name: 'BOUNCE', category: 'Entertainment', discount: null, x: 20, y: 50 },
      { name: 'TIMEZONE', category: 'Entertainment', discount: 25, x: 35, y: 60 },
      { name: '9DX', category: 'Entertainment', discount: null, x: 40, y: 60 },
      { name: 'FUNKY MONKEY', category: 'Entertainment', discount: null, x: 25, y: 60 },
      { name: 'HAMLEYS', category: 'Kids', discount: 30, x: 60, y: 50 },
      { name: 'SPA NATION', category: 'Wellness', discount: 20, x: 70, y: 50 },
      { name: 'HALUCINATE', category: 'Entertainment', discount: null, x: 45, y: 60 },
    ],
  },
]

// Non-store nodes: mall entries (G), the two escalator atriums (every floor),
// the food court seating area (2nd Floor), and the parking lift lobby that
// drops from Ground (near Mall Entry 2) into the basement levels.
export const LANDMARKS = [
  { floor: 'G', name: 'Mall Entry 1', x: 25, y: 95, type: 'entry' },
  { floor: 'G', name: 'Mall Entry 2', x: 48, y: 95, type: 'entry' },
  { floor: 'G', name: 'Mall Entry 3', x: 78, y: 95, type: 'entry' },
  { floor: 'G', name: 'Parking Lift', x: 54, y: 88, type: 'lift' },
  { floor: 'F2', name: 'Food Court', x: 40, y: 60, type: 'landmark' },
  ...['G', 'UG', 'F1', 'F2', 'F3'].flatMap((floor) => [
    { floor, name: 'Atrium 1', x: 30, y: 50, type: 'atrium' },
    { floor, name: 'Atrium 2', x: 63, y: 50, type: 'atrium' },
  ]),
]

// Basement parking: three levels, four zones each, linked to the mall by the
// parking lift. Zones sit in quadrants the way the pillars are painted.
export const PARKING_LEVELS = [
  { id: 'P1', short: 'P1', label: 'Parking P1' },
  { id: 'P2', short: 'P2', label: 'Parking P2' },
  { id: 'P3', short: 'P3', label: 'Parking P3' },
]

export const PARKING_NODES = PARKING_LEVELS.flatMap((level) => [
  { floor: level.id, name: 'Parking Lift', x: 54, y: 50, type: 'lift' },
  { floor: level.id, name: 'Zone A', x: 20, y: 25, type: 'zone' },
  { floor: level.id, name: 'Zone B', x: 80, y: 25, type: 'zone' },
  { floor: level.id, name: 'Zone C', x: 20, y: 75, type: 'zone' },
  { floor: level.id, name: 'Zone D', x: 80, y: 75, type: 'zone' },
])
