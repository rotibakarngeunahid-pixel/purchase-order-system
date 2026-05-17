export default function StepperInput({ value, onChange, disabled, fullWidth = false }) {
  const num = Number(value) || 0;
  const filled = num > 0;

  const btnBase =
    'flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-red-50 hover:text-brand-red hover:border-red-300 active:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed text-xl leading-none transition-colors select-none h-11';
  const btnW = fullWidth ? 'flex-1' : 'w-10';

  return (
    <div className={`flex items-center ${fullWidth ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => onChange(String(Math.max(0, num - 1)))}
        disabled={disabled}
        tabIndex={-1}
        className={`${btnW} ${btnBase} rounded-l-lg border-r-0`}
      >
        −
      </button>
      <input
        type="number"
        min="0"
        value={value === '' ? '' : value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${fullWidth ? 'flex-1 min-w-0' : 'w-16'} h-11 text-center border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-red focus:z-10 disabled:bg-gray-100 disabled:text-gray-400 tabular-nums transition-colors ${
          filled ? 'font-bold text-gray-900 text-base bg-white' : 'font-medium text-gray-500 text-sm'
        }`}
        placeholder="0"
      />
      <button
        type="button"
        onClick={() => onChange(String(num + 1))}
        disabled={disabled}
        tabIndex={-1}
        className={`${btnW} ${btnBase} rounded-r-lg border-l-0`}
      >
        +
      </button>
    </div>
  );
}
