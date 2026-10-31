'use client';

// Lines sold from stock, shared by the e-way bill form and the AMC parts form: the price types a batch carries, what a
// line will cost from its product's in-stock batches, and a small cache of each product's batches and serial units.
import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { roundMoney } from '@/lib/pricing';
import { attributeRows } from './attributes';

export const PRICE_TYPES = [{ id: 'retail', label: 'Retail' }, { id: 'wholesale', label: 'Wholesale' }, { id: 'base', label: 'Base' }];
export const PRICE_FIELD = { base: 'basePrice', wholesale: 'wholesalePrice', retail: 'retailPrice' };

/** Everything the catalog knows about a product, for a line's details: brand, model, then its attributes. */
export const productDetail = (p, category) => [
  p.brand && `Brand: ${p.brand}`,
  p.model && `Model: ${p.model}`,
  ...attributeRows(category, p.attributes).map((a) => `${a.label}: ${a.value}`),
  p.description,
].filter(Boolean).join(' · ').slice(0, 600);

/**
 * What a stock line will cost, from its product's in-stock batches (oldest first): the chosen batch, the batches of
 * the chosen serial units, or the batches FIFO would take. The rate is the qty-weighted price of those batches, so the
 * preview total matches the server, which stores one line per batch at that batch's own price.
 */
export function stockPreview(line, entry) {
  const batches = entry?.batches || [];
  const field = PRICE_FIELD[line.priceType] || 'retailPrice';
  const available = batches.reduce((a, b) => a + (Number(b.qtyRemaining) || 0), 0);
  let used = []; // [batch, qty]
  if (line.serials?.length) {
    const perBatch = new Map();
    for (const u of entry?.units || []) if (line.serials.includes(u.serialNo)) perBatch.set(u.batch?.id, (perBatch.get(u.batch?.id) || 0) + 1);
    used = batches.filter((b) => perBatch.has(b.id)).map((b) => [b, perBatch.get(b.id)]);
  } else if (line.batch) {
    used = batches.filter((b) => b.id === line.batch).map((b) => [b, Number(line.qty) || 0]);
  } else {
    let left = Number(line.qty) || 0;
    for (const b of batches) {
      if (left <= 0) break;
      const take = Math.min(left, Number(b.qtyRemaining) || 0);
      used.push([b, take]);
      left -= take;
    }
  }
  const qty = used.reduce((a, [, q]) => a + q, 0);
  const amount = used.reduce((a, [b, q]) => a + q * (Number(b[field]) || 0), 0);
  const rate = qty ? roundMoney(amount / qty) : roundMoney(Number(used[0]?.[0]?.[field] ?? batches[0]?.[field]) || 0);
  return { rate, available, used, split: new Set(used.map(([b]) => Number(b[field]) || 0)).size > 1 };
}

/** productId → { batches (oldest first, in stock), units (in stock), error }, loaded once per product. */
export function useStockCache() {
  const [stock, setStock] = useState({});
  const loaded = useRef(new Set()); // products fetched (or being fetched); a failed one is dropped so it can be retried
  const loadStock = useCallback(async (product) => {
    if (!product?.id || loaded.current.has(product.id)) return;
    loaded.current.add(product.id);
    try {
      const [batches, units] = await Promise.all([
        api(`/api/stock/products/${product.id}/batches?inStock=true`),
        product.isSerialized ? api(`/api/stock/products/${product.id}/units?status=inStock`) : Promise.resolve([]),
      ]);
      setStock((s) => ({ ...s, [product.id]: { batches, units } }));
    } catch (e) {
      loaded.current.delete(product.id);
      setStock((s) => ({ ...s, [product.id]: { batches: [], units: [], error: e.message } }));
    }
  }, []);
  return { stock, loadStock };
}
