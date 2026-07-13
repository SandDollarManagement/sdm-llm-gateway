// src/lib/routing/cost.js
// Per-call cost computation from the model_prices table. This is what makes
// call_logs.cost_usd real (it was always NULL before) and therefore what makes
// any spend cap actually fire.
//
// IMPORTANT: cost is priced by the model string the gateway ITSELF resolved
// (the alias chain's entry.model), never the provider's echoed/dated model id
// (e.g. "claude-sonnet-5-20260315"). Pricing by the echoed value would miss on
// nearly every call and silently re-break the cap.

import { query } from '@/lib/db'

const CACHE_TTL_MS = 60_000
let priceCache = null
let priceCacheAt = 0

async function loadPrices() {
  const now = Date.now()
  if (priceCache && now - priceCacheAt < CACHE_TTL_MS) return priceCache
  const map = new Map()
  try {
    const rows = await query(`SELECT model, input_per_mtok, output_per_mtok FROM model_prices`, [])
    if (Array.isArray(rows)) {
      for (const r of rows) {
        map.set(r.model, {
          input: Number(r.input_per_mtok),
          output: Number(r.output_per_mtok),
        })
      }
    }
  } catch (err) {
    // Cost is best-effort observability; a lookup failure must never break the
    // request path. Enforcement of the cap relies on the pre-call pricing
    // check in policy.js, not on this. Return an empty (unpriced) map.
    console.warn('[cost] model_prices lookup failed; treating all models as unpriced:', err.message)
    return map
  }
  priceCache = map
  priceCacheAt = now
  return map
}

/** Force a cache refresh (used by tests and after price edits). */
export function clearPriceCache() {
  priceCache = null
  priceCacheAt = 0
}

/**
 * Is this model priced? Used as a pre-call gate for budget-enforced keys so an
 * unpriced model is REFUSED rather than silently billed as free.
 * @returns {Promise<boolean>}
 */
export async function isModelPriced(model) {
  if (!model) return false
  const prices = await loadPrices()
  return prices.has(model)
}

/**
 * Compute the USD cost of a call.
 * @param {object} opts
 * @param {string} opts.model            The RESOLVED chain model (entry.model).
 * @param {number|null} opts.requestTokens
 * @param {number|null} opts.responseTokens
 * @returns {Promise<{ costUsd: number|null, priced: boolean }>}
 *          costUsd is null (and priced=false) when the model has no price row;
 *          callers must treat that as "unknown", never as zero.
 */
export async function computeCostUsd({ model, requestTokens, responseTokens }) {
  const prices = await loadPrices()
  const price = model ? prices.get(model) : null
  if (!price) {
    if (model) {
      console.warn(
        `[cost] no price row for model "${model}"; cost_usd will be NULL (unknown, not zero).`,
      )
    }
    return { costUsd: null, priced: false }
  }
  const inTok = Number(requestTokens) || 0
  const outTok = Number(responseTokens) || 0
  const costUsd = (inTok / 1_000_000) * price.input + (outTok / 1_000_000) * price.output
  return { costUsd, priced: true }
}
