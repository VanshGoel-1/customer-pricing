/**
 * Grid of tappable product cards for the billing screen.
 * Disabled until a customer is selected.
 */
export default function QuickProductGrid({ products, onAdd, disabled }) {
  if (products.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No quick products yet.{' '}
        <span className="text-gray-500">A manager can add them under Quick Products.</span>
      </p>
    )
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={disabled}
          onClick={() => onAdd(p)}
          title={disabled ? 'Select a customer first' : p.name}
          className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200
                     bg-white hover:bg-brand-50 hover:border-brand-400 active:bg-brand-100
                     transition-colors text-center min-h-[80px]
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white
                     disabled:hover:border-gray-200"
        >
          <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2 w-full">
            {p.name}
          </p>
          <p className="text-sm font-bold text-brand-600 mt-1">
            ₹{Number(p.base_price).toFixed(2)}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">{p.unit}</p>
        </button>
      ))}
    </div>
  )
}
