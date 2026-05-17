export default function StepperInput({ value, onChange, disabled }) {
  const num = Number(value) || 0;
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => onChange(String(Math.max(0, num - 1)))}
        disabled={disabled}
        tabIndex={-1}
        className="w-9 h-10 flex items-center justify-center rounded-l-lg border border-r-0 border-gray-200 bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-brand-red hover:border-red-200 active:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed text-xl leading-none transition-colors select-none"
      >
        −
      </button>
      <input
        type="number"
        min="0"
        value={value === '' ? '' : value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-14 h-10 text-center border border-gray-200 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-brand-red focus:z-10 disabled:bg-gray-100 disabled:text-gray-400 tabular-nums"
        placeholder="0"
      />
      <button
        type="button"
        onClick={() => onChange(String(num + 1))}
        disabled={disabled}
        tabIndex={-1}
        className="w-9 h-10 flex items-center justify-center rounded-r-lg border border-l-0 border-gray-200 bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-brand-red hover:border-red-200 active:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed text-xl leading-none transition-colors select-none"
      >
        +
      </button>
    </div>
  );
}
