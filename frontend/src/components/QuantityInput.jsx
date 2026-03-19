/**
 * Unit-aware quantity input with stepper buttons.
 *
 * - kg / l  → dual input (main unit + sub unit) with ± steppers
 * - g / ml  → single input, steps of 50
 * - pcs / pack / etc → single integer input, steps of 1
 * - All fields are manually editable
 */
import { clamp, dualToQty, getUnitConfig, qtyToDual } from '../utils/unitConfig'

const BTN = 'w-7 h-7 flex items-center justify-center rounded border border-gray-300 ' +
            'hover:bg-gray-100 active:bg-gray-200 text-gray-700 font-bold text-sm flex-shrink-0 ' +
            'disabled:opacity-40 disabled:cursor-not-allowed select-none'

const INPUT = 'border border-gray-300 rounded-lg text-center text-sm py-1 focus:outline-none ' +
              'focus:ring-1 focus:ring-brand-500 focus:border-brand-500'

export default function QuantityInput({ unit, value, onChange, pieceWeightGrams }) {
  const cfg = getUnitConfig(unit)

  const inc = () => onChange(clamp(value + cfg.step, cfg))
  const dec = () => onChange(clamp(value - cfg.step, cfg))

  /* ── Dual input (kg ↔ g  /  l ↔ ml) ─────────────────────────────────── */
  if (cfg.dual) {
    const { main, sub } = qtyToDual(value, cfg.dualFactor)

    const setMain = (v) => {
      const n = Math.max(0, parseInt(v) || 0)
      onChange(dualToQty(n, sub, cfg.dualFactor))
    }
    const setSub = (v) => {
      // carry over when sub reaches dualFactor (e.g. 1000 g → 1 kg)
      let s = Math.max(0, parseInt(v) || 0)
      let m = main
      if (s >= cfg.dualFactor) {
        m += Math.floor(s / cfg.dualFactor)
        s  = s % cfg.dualFactor
      }
      onChange(dualToQty(m, s, cfg.dualFactor))
    }

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <button type="button" onClick={dec} className={BTN}>−</button>

          <input
            type="number" min="0" step="1"
            value={main}
            onChange={(e) => setMain(e.target.value)}
            className={`${INPUT} w-14 px-1`}
          />
          <span className="text-xs text-gray-500 flex-shrink-0">{unit}</span>

          <input
            type="number" min="0" step={cfg.step * cfg.dualFactor} max={cfg.dualFactor - 1}
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            className={`${INPUT} w-16 px-1`}
          />
          <span className="text-xs text-gray-500 flex-shrink-0">{cfg.dualUnit}</span>

          <button type="button" onClick={inc} className={BTN}>+</button>
        </div>

        {/* Piece weight estimate */}
        {cfg.group === 'count' && pieceWeightGrams && value > 0 && (
          <p className="text-[10px] text-gray-400">
            ≈ {(value * Number(pieceWeightGrams) / 1000).toFixed(3)} kg
          </p>
        )}
      </div>
    )
  }

  /* ── Single input ─────────────────────────────────────────────────────── */
  const isInt = cfg.precision === 0

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <button type="button" onClick={dec} className={BTN}>−</button>

        <input
          type="number"
          min={cfg.step}
          step={cfg.step}
          value={value}
          onChange={(e) => {
            const n = isInt ? parseInt(e.target.value) : parseFloat(e.target.value)
            onChange(isNaN(n) ? cfg.step : clamp(n, cfg))
          }}
          className={`${INPUT} w-20 px-1`}
        />
        <span className="text-xs text-gray-500 flex-shrink-0">{unit}</span>

        <button type="button" onClick={inc} className={BTN}>+</button>
      </div>

      {cfg.group === 'count' && pieceWeightGrams && value > 0 && (
        <p className="text-[10px] text-gray-400">
          ≈ {(value * Number(pieceWeightGrams) / 1000).toFixed(3)} kg
        </p>
      )}
    </div>
  )
}
