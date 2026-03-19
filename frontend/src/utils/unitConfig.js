/**
 * Unit configuration for quantity inputs on the billing screen.
 *
 * Groups:
 *   weight      — kg  (dual input: kg + g)
 *   weight-small— g   (single, steps of 50)
 *   volume      — l   (dual input: L + ml)
 *   volume-small— ml  (single, steps of 50)
 *   count       — pcs / piece / nos
 *   pack        — pack / dozen / box
 *   generic     — anything else
 */

export const UNIT_CONFIG = {
  kg:     { group: 'weight',        default: 1,   step: 0.250, precision: 3, dual: true,  dualUnit: 'g',  dualFactor: 1000 },
  g:      { group: 'weight-small',  default: 250, step: 50,    precision: 0, dual: false },
  gram:   { group: 'weight-small',  default: 250, step: 50,    precision: 0, dual: false },
  l:      { group: 'volume',        default: 1,   step: 0.250, precision: 3, dual: true,  dualUnit: 'ml', dualFactor: 1000 },
  litre:  { group: 'volume',        default: 1,   step: 0.250, precision: 3, dual: true,  dualUnit: 'ml', dualFactor: 1000 },
  liter:  { group: 'volume',        default: 1,   step: 0.250, precision: 3, dual: true,  dualUnit: 'ml', dualFactor: 1000 },
  ml:     { group: 'volume-small',  default: 250, step: 50,    precision: 0, dual: false },
  pcs:    { group: 'count',         default: 1,   step: 1,     precision: 0, dual: false },
  piece:  { group: 'count',         default: 1,   step: 1,     precision: 0, dual: false },
  pieces: { group: 'count',         default: 1,   step: 1,     precision: 0, dual: false },
  nos:    { group: 'count',         default: 1,   step: 1,     precision: 0, dual: false },
  pack:   { group: 'pack',          default: 1,   step: 1,     precision: 0, dual: false },
  packs:  { group: 'pack',          default: 1,   step: 1,     precision: 0, dual: false },
  box:    { group: 'pack',          default: 1,   step: 1,     precision: 0, dual: false },
  dozen:  { group: 'pack',          default: 1,   step: 1,     precision: 0, dual: false },
}

/** Returns config for the given unit string (case-insensitive). Falls back to generic. */
export function getUnitConfig(unit) {
  return UNIT_CONFIG[unit?.toLowerCase()] ?? {
    group: 'generic', default: 1, step: 1, precision: 2, dual: false,
  }
}

/**
 * Combine dual inputs (main unit + sub unit) into a single quantity.
 * e.g. main=1 (kg), sub=250 (g), factor=1000  →  1.250
 */
export function dualToQty(main, sub, factor) {
  const m = parseFloat(main) || 0
  const s = parseFloat(sub)  || 0
  return parseFloat((m + s / factor).toFixed(3))
}

/**
 * Split a single quantity into dual display values.
 * e.g. qty=1.250, factor=1000  →  { main: 1, sub: 250 }
 */
export function qtyToDual(qty, factor) {
  const n    = parseFloat(qty) || 0
  const main = Math.floor(n)
  const sub  = Math.round((n - main) * factor)
  return { main, sub }
}

/** Clamp a value to be at least `min` (default = cfg.step). */
export function clamp(value, cfg, min = cfg.step) {
  return Math.max(min, parseFloat(Number(value).toFixed(cfg.precision)))
}
