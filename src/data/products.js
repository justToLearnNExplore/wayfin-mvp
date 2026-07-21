// Store-approved product catalogue for the visual-match demo.
// A vision response may return only an `id` from this list. Prices, sizes, and
// links always come from this catalogue — never from the vision model.

export const PRODUCTS = [
  {
    id: 'newme-ribbed-square-neck-bodysuit',
    brand: 'NEWME',
    store: 'NEW ME',
    name: 'Ribbed Square-Neck Bodysuit',
    size: 'M',
    storePrice: 600,
    onlinePrice: 499,
    url: 'https://newme.asia',
    otherSizes: ['S', 'L'],
    visualDescriptor: 'a fitted ribbed bodysuit with a square neckline',
  },
  {
    id: 'levis-511-slim-fit-jeans',
    brand: "Levi's",
    store: "LEVI'S",
    name: '511 Slim Fit Jeans',
    size: '32',
    storePrice: 3299,
    onlinePrice: 2639,
    url: 'https://www.levi.in',
    otherSizes: ['30', '34', '36'],
    visualDescriptor: 'Levi’s 511 slim-fit denim jeans with a classic five-pocket cut',
  },
  {
    id: 'uniqlo-airism-oversized-t-shirt',
    brand: 'UNIQLO',
    store: 'UNIQLO',
    name: 'AIRism Cotton Oversized T-Shirt',
    size: 'L',
    storePrice: 990,
    onlinePrice: 1290,
    url: 'https://www.uniqlo.com/in',
    otherSizes: ['S', 'M', 'XL', 'XXL'],
    visualDescriptor: 'a UNIQLO AIRism cotton oversized crew-neck T-shirt',
  },
]

export const findProductById = (id) => PRODUCTS.find((p) => p.id === id) ?? null

// The build-challenge walkthrough demonstrates one real store-scoped item.
// Keep this explicit so the MVP never pretends to recognise arbitrary goods.
export const MVP_DEMO_PRODUCT_ID = 'newme-ribbed-square-neck-bodysuit'
