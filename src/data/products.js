// Seeded product DB for the price-compare demo.
// Real barcode scans match on `barcode`; the scanner also offers these as
// one-tap demo products so the flow never blocks a live demo.

export const PRODUCTS = [
  {
    barcode: '8904368706519',
    brand: 'NEWME',
    store: 'NEW ME',
    name: 'Ribbed Square-Neck Bodysuit',
    size: 'M',
    storePrice: 600,
    onlinePrice: 499,
    url: 'https://newme.asia',
    otherSizes: ['S', 'L'],
  },
  {
    barcode: '8904310415862',
    brand: "Levi's",
    store: "LEVI'S",
    name: '511 Slim Fit Jeans',
    size: '32',
    storePrice: 3299,
    onlinePrice: 2639,
    url: 'https://www.levi.in',
    otherSizes: ['30', '34', '36'],
  },
  {
    barcode: '4550182305128',
    brand: 'UNIQLO',
    store: 'UNIQLO',
    name: 'AIRism Cotton Oversized T-Shirt',
    size: 'L',
    storePrice: 990,
    onlinePrice: 1290,
    url: 'https://www.uniqlo.com/in',
    otherSizes: ['S', 'M', 'XL', 'XXL'],
  },
]

export const findProduct = (barcode) =>
  PRODUCTS.find((p) => p.barcode === barcode) ?? null
