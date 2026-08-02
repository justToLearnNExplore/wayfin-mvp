// Orion Mall @ Brigade Gateway — store data.
//
// GENERATED from the official mall map at orionmalls.com. Every x,y below is
// the real position of that logo on the official floor plan, read from the
// page's own stylesheet — left% maps to x, top% maps to y, both already in
// the 0..100 space this app uses.
//
// x 0..100 runs along the mall's long axis (~200 m), y 0..100 across it
// (~40 m). Atriums 1 & 2 hold the escalators and are the only inter-floor
// connectors.
//
// 2nd and 3rd floor outlets marked APPROX are painted into the official
// page's background image rather than tagged, so their names come from the
// published floor plan and their positions are estimated from it.
//
// Discounts are demo placeholders.

export const FLOORS = [
  {
    id: 'G',
    short: 'G',
    label: 'Ground Floor',
    stores: [
      { name: 'PUMA', category: 'Sportswear', discount: 40, x: 6.2, y: 73.0 },
      { name: 'H&M', category: 'Fashion', discount: 30, x: 8.0, y: 26.0 },
      { name: 'UNDER ARMOUR', category: 'Sportswear', discount: null, x: 13.0, y: 70.0 },
      { name: 'NIKE', category: 'Sportswear', discount: null, x: 15.2, y: 25.0 },
      { name: 'SEPHORA', category: 'Beauty', discount: 20, x: 17.5, y: 70.5 },
      { name: 'GUESS', category: 'Fashion', discount: null, x: 19.5, y: 37.0 },
      { name: 'CALVIN KLEIN', category: 'Fashion', discount: null, x: 21.4, y: 70.2 },
      { name: 'LENSCRAFTERS', category: 'Optics', discount: null, x: 22.2, y: 37.0 },
      { name: 'ARMANI EXCHANGE', category: 'Fashion', discount: null, x: 26.2, y: 29.0 },
      { name: 'SWAROVSKI', category: 'Accessories', discount: null, x: 27.9, y: 68.5 },
      { name: "LEVI'S", category: 'Fashion', discount: 50, x: 28.4, y: 29.5 },
      { name: 'SUPERDRY', category: 'Fashion', discount: 40, x: 30.2, y: 71.8 },
      { name: 'CHARLES & KEITH', category: 'Accessories', discount: null, x: 30.5, y: 29.0 },
      { name: 'ALDO', category: 'Footwear', discount: 25, x: 32.4, y: 72.0 },
      { name: 'JACK & JONES', category: 'Fashion', discount: null, x: 32.8, y: 27.5 },
      { name: 'MARKS & SPENCER LINGERIE', category: 'Innerwear', discount: null, x: 34.8, y: 72.0 },
      { name: 'VERO MODA', category: 'Fashion', discount: null, x: 35.0, y: 27.5 },
      { name: 'TOMMY HILFIGER', category: 'Fashion', discount: null, x: 37.0, y: 73.5 },
      { name: 'LEGO', category: 'Kids', discount: null, x: 37.8, y: 29.0 },
      { name: 'STEVE MADDEN', category: 'Footwear', discount: null, x: 39.5, y: 70.2 },
      { name: 'LOOKS UNISEX SALON', category: 'Wellness', discount: null, x: 41.8, y: 18.0 },
      { name: 'MANGO', category: 'Fashion', discount: null, x: 46.5, y: 27.0 },
      { name: 'BATH & BODY WORKS', category: 'Beauty', discount: null, x: 47.8, y: 71.2 },
      { name: 'FOSSIL', category: 'Accessories', discount: 20, x: 49.2, y: 28.0 },
      { name: 'ETHOS', category: 'Accessories', discount: null, x: 50.2, y: 71.0 },
      { name: 'ONLY', category: 'Fashion', discount: 30, x: 52.1, y: 28.0 },
      { name: 'BIRKENSTOCK', category: 'Footwear', discount: null, x: 52.8, y: 71.2 },
      { name: 'NICOBAR', category: 'Fashion', discount: null, x: 55.1, y: 70.0 },
      { name: 'UNIQLO', category: 'Fashion', discount: 30, x: 59.0, y: 22.0 },
      { name: 'MAC', category: 'Beauty', discount: null, x: 61.8, y: 68.2 },
      { name: 'ADIDAS ORIGINALS', category: 'Sportswear', discount: null, x: 63.9, y: 74.0 },
      { name: 'FOREVER NEW', category: 'Fashion', discount: null, x: 66.2, y: 73.5 },
      { name: 'GANT', category: 'Fashion', discount: null, x: 68.6, y: 73.0 },
      { name: "VICTORIA'S SECRET", category: 'Innerwear', discount: null, x: 69.0, y: 33.0 },
      { name: 'LACOSTE', category: 'Fashion', discount: null, x: 71.0, y: 74.0 },
      { name: 'SSB TAILORS', category: 'Fashion', discount: null, x: 72.6, y: 18.5 },
      { name: 'AJIO LUXE', category: 'Department', discount: null, x: 75.8, y: 54.0 },
      { name: 'WESTSIDE', category: 'Department', discount: null, x: 82.5, y: 31.0 },
    ],
  },
  {
    id: 'UG',
    short: 'UG',
    label: 'Upper Ground Floor',
    stores: [
      { name: 'YOU MEE', category: 'Food', discount: null, x: 7.2, y: 14.0 },
      { name: 'PANTALOONS', category: 'Department', discount: 40, x: 9.5, y: 49.6 },
      { name: 'PAUL', category: 'Cafe', discount: null, x: 11.5, y: 13.5 },
      { name: 'GEIST BREWING', category: 'Food', discount: null, x: 16.5, y: 13.5 },
      { name: 'JUST IN TIME', category: 'Accessories', discount: null, x: 16.9, y: 35.5 },
      { name: 'MOKOBARA', category: 'Lifestyle', discount: null, x: 18.2, y: 72.7 },
      { name: 'HUNKEMOLLER', category: 'Innerwear', discount: null, x: 18.9, y: 36.2 },
      { name: 'HIDESIGN', category: 'Accessories', discount: null, x: 20.0, y: 72.7 },
      { name: 'U.S. POLO ASSN.', category: 'Fashion', discount: 25, x: 27.3, y: 28.0 },
      { name: 'DA MILANO', category: 'Accessories', discount: null, x: 28.0, y: 73.5 },
      { name: 'WILLIAM PENN', category: 'Lifestyle', discount: null, x: 29.8, y: 72.9 },
      { name: 'ASICS', category: 'Sportswear', discount: null, x: 30.0, y: 28.5 },
      { name: 'TOSCANO', category: 'Food', discount: null, x: 30.2, y: 9.2 },
      { name: 'SIMON CARTER', category: 'Fashion', discount: null, x: 31.5, y: 72.5 },
      { name: 'SKECHERS', category: 'Footwear', discount: 30, x: 34.0, y: 76.7 },
      { name: 'ADIDAS', category: 'Sportswear', discount: null, x: 34.3, y: 28.6 },
      { name: 'UNITED COLORS OF BENETTON', category: 'Fashion', discount: 35, x: 36.2, y: 76.7 },
      { name: 'RARE RABBIT', category: 'Fashion', discount: null, x: 38.8, y: 76.7 },
      { name: 'NEW ERA', category: 'Accessories', discount: null, x: 41.1, y: 36.6 },
      { name: 'STARBUCKS', category: 'Cafe', discount: null, x: 43.2, y: 60.0 },
      { name: 'ARROW', category: 'Fashion', discount: 30, x: 48.8, y: 26.6 },
      { name: 'BOSE', category: 'Electronics', discount: null, x: 51.8, y: 26.6 },
      { name: 'BURMA BURMA', category: 'Food', discount: null, x: 54.5, y: 8.5 },
      { name: 'IMAGINE', category: 'Electronics', discount: null, x: 54.5, y: 27.2 },
      { name: 'CELIO', category: 'Fashion', discount: null, x: 56.2, y: 76.8 },
      { name: 'LOUIS PHILIPPE', category: 'Fashion', discount: null, x: 58.8, y: 27.2 },
      { name: 'ALLEN SOLLY', category: 'Fashion', discount: 30, x: 59.2, y: 75.5 },
      { name: 'FLYING MACHINE', category: 'Fashion', discount: null, x: 62.8, y: 73.5 },
      { name: 'VAN HEUSEN', category: 'Fashion', discount: 25, x: 62.9, y: 27.5 },
      { name: 'BOMBAY BRASSERIE', category: 'Food', discount: null, x: 63.5, y: 8.5 },
      { name: 'HUSH PUPPIES', category: 'Footwear', discount: null, x: 65.2, y: 32.9 },
      { name: 'AMERICAN EAGLE', category: 'Fashion', discount: 25, x: 65.2, y: 75.2 },
      { name: 'TITAN', category: 'Accessories', discount: 15, x: 67.6, y: 34.2 },
      { name: 'MOCHI', category: 'Footwear', discount: null, x: 67.7, y: 75.5 },
      { name: 'PEPE JEANS', category: 'Fashion', discount: 30, x: 69.5, y: 32.0 },
      { name: 'STRIDE', category: 'Footwear', discount: null, x: 70.0, y: 76.5 },
      { name: 'MOBIZONE', category: 'Electronics', discount: null, x: 72.6, y: 37.0 },
      { name: 'SHOPPERS STOP', category: 'Department', discount: null, x: 82.0, y: 42.0 },
    ],
  },
  {
    id: 'F1',
    short: '1st',
    label: '1st Floor',
    stores: [
      { name: 'HOME CENTRE', category: 'Home', discount: null, x: 7.0, y: 70.2 },
      { name: 'MAX', category: 'Fashion', discount: 40, x: 9.0, y: 25.0 },
      { name: 'NEW ME', category: 'Fashion', discount: 25, x: 15.4, y: 76.2 },
      { name: 'LENSKART', category: 'Optics', discount: 30, x: 18.3, y: 72.5 },
      { name: 'HOUSE OF FETT', category: 'Fashion', discount: null, x: 18.8, y: 34.5 },
      { name: 'GKB OPTICALS', category: 'Optics', discount: null, x: 20.0, y: 72.5 },
      { name: 'BAKE ELEVEN', category: 'Cafe', discount: null, x: 25.5, y: 25.2 },
      { name: 'MOTHERCARE', category: 'Kids', discount: null, x: 27.4, y: 24.0 },
      { name: 'MUSTARD', category: 'Fashion', discount: null, x: 27.9, y: 72.2 },
      { name: 'JACK & JONES JUNIOR', category: 'Kids', discount: null, x: 29.8, y: 72.8 },
      { name: 'JAYPORE', category: 'Ethnic', discount: null, x: 30.1, y: 21.8 },
      { name: 'KUSHALS', category: 'Accessories', discount: null, x: 31.9, y: 74.2 },
      { name: 'MINISO', category: 'Lifestyle', discount: 20, x: 32.2, y: 22.2 },
      { name: 'GO COLORS', category: 'Fashion', discount: null, x: 34.0, y: 75.5 },
      { name: 'CAVA', category: 'Fashion', discount: null, x: 34.5, y: 21.7 },
      { name: 'ENVI SALON', category: 'Wellness', discount: null, x: 36.0, y: 75.8 },
      { name: 'HEALTH & GLOW', category: 'Beauty', discount: null, x: 36.6, y: 25.2 },
      { name: 'SOCH', category: 'Ethnic', discount: null, x: 38.9, y: 77.2 },
      { name: 'UNITED COLORS OF BENETTON KIDS', category: 'Kids', discount: null, x: 49.5, y: 25.8 },
      { name: 'ZIVAME', category: 'Innerwear', discount: 30, x: 50.0, y: 72.5 },
      { name: 'BEWAKOOF', category: 'Fashion', discount: 50, x: 51.5, y: 25.5 },
      { name: 'CARATLANE', category: 'Accessories', discount: null, x: 52.0, y: 72.2 },
      { name: 'SNITCH', category: 'Fashion', discount: 30, x: 53.5, y: 19.9 },
      { name: 'TANEIRA', category: 'Ethnic', discount: null, x: 54.0, y: 23.0 },
      { name: 'AUKERA', category: 'Accessories', discount: null, x: 54.0, y: 75.2 },
      { name: 'ALLEN SOLLY JUNIOR', category: 'Kids', discount: null, x: 56.5, y: 75.5 },
      { name: 'VAN HEUSEN WOMAN', category: 'Fashion', discount: null, x: 58.5, y: 76.5 },
      { name: 'RELIANCE DIGITAL', category: 'Electronics', discount: null, x: 60.5, y: 18.9 },
      { name: 'FABINDIA', category: 'Ethnic', discount: null, x: 61.0, y: 76.2 },
      { name: 'RITU KUMAR', category: 'Ethnic', discount: null, x: 63.2, y: 76.2 },
      { name: 'JOCKEY', category: 'Innerwear', discount: null, x: 65.3, y: 76.2 },
      { name: 'CROCS', category: 'Footwear', discount: 25, x: 67.2, y: 29.0 },
      { name: 'THE SLEEP COMPANY', category: 'Home', discount: null, x: 67.3, y: 75.5 },
      { name: 'METRO SHOES', category: 'Footwear', discount: null, x: 67.8, y: 76.5 },
      { name: 'AURELIA', category: 'Ethnic', discount: null, x: 69.5, y: 29.8 },
      { name: 'DECATHLON', category: 'Sportswear', discount: null, x: 80.5, y: 17.5 },
      { name: 'MANYAVAR', category: 'Ethnic', discount: null, x: 82.2, y: 56.2 },
      { name: 'RMKV', category: 'Ethnic', discount: null, x: 83.8, y: 75.5 },
      { name: 'RELIANCE GO FRESH', category: 'Grocery', discount: null, x: 84.2, y: 40.0 },
    ],
  },
  {
    id: 'F2',
    short: '2nd',
    label: '2nd Floor',
    stores: [
      { name: 'KFC', category: 'Food', discount: null, x: 7.5, y: 12.2 },
      { name: "NANDO'S", category: 'Food', discount: null, x: 25.8, y: 29.2 },
      { name: 'FOO', category: 'Food', discount: null, x: 28.2, y: 18.2 },
      { name: "CHILI'S", category: 'Food', discount: null, x: 33.5, y: 14.0 },
      { name: 'PIZZA EXPRESS', category: 'Food', discount: 25, x: 35.8, y: 27.5 },
      { name: 'RAJDHANI', category: 'Food', discount: null, x: 38.6, y: 77.5 },
      { name: 'BURGER KING', category: 'Food', discount: 20, x: 41.3, y: 70.0 },
      { name: 'THIRD WAVE COFFEE', category: 'Cafe', discount: null, x: 44.8, y: 70.0 },
      { name: 'PUNJAB GRILL', category: 'Food', discount: null, x: 51.8, y: 72.5 },
      { name: 'PVR', category: 'Cinema', discount: null, x: 77.0, y: 40.5 },
      { name: 'TACO BELL', category: 'Food', discount: null, x: 9, y: 26 }, // APPROX
      { name: 'POPEYES', category: 'Food', discount: null, x: 17, y: 34 }, // APPROX
      { name: 'BASIL', category: 'Food', discount: null, x: 8, y: 58 }, // APPROX
      { name: 'GO PIZZA', category: 'Food', discount: null, x: 9, y: 70 }, // APPROX
      { name: 'BASKIN ROBBINS', category: 'Food', discount: null, x: 15, y: 86 }, // APPROX
      { name: 'WOW CHICKEN', category: 'Food', discount: null, x: 20, y: 86 }, // APPROX
      { name: "DOMINO'S PIZZA", category: 'Food', discount: null, x: 24, y: 86 }, // APPROX
      { name: 'NAGAS', category: 'Food', discount: null, x: 28, y: 86 }, // APPROX
      { name: 'SUBWAY', category: 'Food', discount: null, x: 34, y: 86 }, // APPROX
      { name: 'WOW MOMO', category: 'Food', discount: null, x: 38, y: 86 }, // APPROX
      { name: "FRESHMAN'S", category: 'Food', discount: null, x: 42, y: 86 }, // APPROX
      { name: 'NOODLE ROBOT', category: 'Food', discount: null, x: 46, y: 86 }, // APPROX
      { name: "MCDONALD'S", category: 'Food', discount: null, x: 52, y: 86 }, // APPROX
      { name: 'CHURMUN', category: 'Food', discount: null, x: 54, y: 34 }, // APPROX
      { name: 'COOKIE MAN', category: 'Food', discount: null, x: 60, y: 54 }, // APPROX
      { name: 'CROSSWORD', category: 'Books', discount: 20, x: 63, y: 60 }, // APPROX
      { name: 'MOD', category: 'Food', discount: null, x: 59, y: 70 }, // APPROX
      { name: 'BOX OFFICE', category: 'Cinema', discount: null, x: 82, y: 44 }, // APPROX
    ],
  },
  {
    id: 'F3',
    short: '3rd',
    label: '3rd Floor',
    stores: [
      { name: 'BOUNCE INC', category: 'Entertainment', discount: null, x: 10.0, y: 41.5 },
      { name: 'FUNKY MONKEYS', category: 'Kids', discount: null, x: 25.0, y: 18.8 },
      { name: 'TIMEZONE ARENA', category: 'Entertainment', discount: null, x: 32.8, y: 75.0 },
      { name: 'TIMEZONE', category: 'Entertainment', discount: 25, x: 36.5, y: 24.2 },
      { name: 'HAMLEYS', category: 'Kids', discount: 30, x: 43.4, y: 56.2 },
      { name: 'SPA NATION', category: 'Wellness', discount: 20, x: 49.2, y: 24.5 },
      { name: 'PVR', category: 'Cinema', discount: null, x: 81.5, y: 40.2 },
      { name: 'HYPER SENSE PDX THEATRE', category: 'Cinema', discount: null, x: 48, y: 37 }, // APPROX
      { name: 'HOLUCINATE', category: 'Entertainment', discount: null, x: 57, y: 38 }, // APPROX
    ],
  },
]

export const LANDMARKS = [
  { floor: 'G', name: 'Mall Entry 1', x: 25, y: 92, type: 'entry' },
  { floor: 'G', name: 'Mall Entry 2', x: 45, y: 92, type: 'entry' },
  { floor: 'G', name: 'Mall Entry 3', x: 74, y: 92, type: 'entry' },
  { floor: 'G', name: 'Parking Lift', x: 70, y: 72, type: 'lift' },
  { floor: 'F2', name: 'Food Court', x: 40, y: 70, type: 'landmark' },
  { floor: 'G', name: 'Atrium 1', x: 35, y: 55, type: 'atrium' },
  { floor: 'G', name: 'Atrium 2', x: 58, y: 55, type: 'atrium' },
  { floor: 'UG', name: 'Atrium 1', x: 35, y: 55, type: 'atrium' },
  { floor: 'UG', name: 'Atrium 2', x: 58, y: 55, type: 'atrium' },
  { floor: 'F1', name: 'Atrium 1', x: 35, y: 55, type: 'atrium' },
  { floor: 'F1', name: 'Atrium 2', x: 58, y: 55, type: 'atrium' },
  { floor: 'F2', name: 'Atrium 1', x: 35, y: 55, type: 'atrium' },
  { floor: 'F2', name: 'Atrium 2', x: 58, y: 55, type: 'atrium' },
  { floor: 'F3', name: 'Atrium 1', x: 35, y: 55, type: 'atrium' },
  { floor: 'F3', name: 'Atrium 2', x: 58, y: 55, type: 'atrium' },
]

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
