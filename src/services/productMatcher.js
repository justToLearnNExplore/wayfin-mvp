import { MVP_DEMO_PRODUCT_ID } from '../data/products.js'

// Build-challenge MVP: one pre-approved NEW ME item, matched locally after a
// product photo is captured. The future server matcher remains in api/ for the
// multi-SKU rollout, but is intentionally not called in this deterministic demo.
export async function matchProductImage() {
  await new Promise((resolve) => setTimeout(resolve, 350))
  return MVP_DEMO_PRODUCT_ID
}
