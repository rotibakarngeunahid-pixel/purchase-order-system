const ICON_MAP = [
  { keys: ['roti tawar'], emoji: '🍞', hue: 'amber' },
  { keys: ['roti canai', 'canai'], emoji: '🫓', hue: 'orange' },
  { keys: ['risol'], emoji: '🥟', hue: 'yellow' },
  { keys: ['mentega', 'butter'], emoji: '🧈', hue: 'yellow' },
  { keys: ['susu kental', 'susu'], emoji: '🥛', hue: 'sky' },
  { keys: ['keju'], emoji: '🧀', hue: 'yellow' },
  { keys: ['messes', 'coklat'], emoji: '🍫', hue: 'amber' },
  { keys: ['strawberry'], emoji: '🍓', hue: 'rose' },
  { keys: ['blueberry'], emoji: '🫐', hue: 'violet' },
  { keys: ['nanas', 'pineapple'], emoji: '🍍', hue: 'yellow' },
  { keys: ['tiramisu', 'glaze'], emoji: '🎂', hue: 'pink' },
  { keys: ['milo'], emoji: '☕', hue: 'amber' },
  { keys: ['kresek', 'kantong'], emoji: '🛍️', hue: 'slate' },
  { keys: ['box', 'dus', 'kardus'], emoji: '📦', hue: 'orange' },
  { keys: ['sarung tangan'], emoji: '🧤', hue: 'blue' },
  { keys: ['isolasi', 'selotip'], emoji: '🩹', hue: 'slate' },
  { keys: ['minyak goreng', 'minyak'], emoji: '🫒', hue: 'green' },
  { keys: ['air mineral', 'air'], emoji: '💧', hue: 'sky' },
  { keys: ['gula'], emoji: '🍬', hue: 'pink' },
  { keys: ['tepung'], emoji: '🌾', hue: 'yellow' },
  { keys: ['telur'], emoji: '🥚', hue: 'yellow' },
  { keys: ['gas', 'lpg'], emoji: '🔥', hue: 'orange' },
  { keys: ['kopi', 'coffee'], emoji: '☕', hue: 'amber' },
  { keys: ['teh', 'tea'], emoji: '🍵', hue: 'green' },
  { keys: ['saos', 'saus', 'sauce'], emoji: '🍶', hue: 'red' },
  { keys: ['garam', 'salt'], emoji: '🧂', hue: 'slate' },
  { keys: ['baking'], emoji: '🧁', hue: 'pink' },
];

// Tailwind color classes per hue (untuk card empty state)
const HUE_CLASSES = {
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  icon: 'bg-amber-100'  },
  orange: { bg: 'bg-orange-50', border: 'border-orange-100', icon: 'bg-orange-100' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-100', icon: 'bg-yellow-100' },
  sky:    { bg: 'bg-sky-50',    border: 'border-sky-100',    icon: 'bg-sky-100'    },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-100',   icon: 'bg-rose-100'   },
  violet: { bg: 'bg-violet-50', border: 'border-violet-100', icon: 'bg-violet-100' },
  pink:   { bg: 'bg-pink-50',   border: 'border-pink-100',   icon: 'bg-pink-100'   },
  green:  { bg: 'bg-green-50',  border: 'border-green-100',  icon: 'bg-green-100'  },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   icon: 'bg-blue-100'   },
  slate:  { bg: 'bg-slate-50',  border: 'border-slate-100',  icon: 'bg-slate-100'  },
  red:    { bg: 'bg-red-50',    border: 'border-red-100',    icon: 'bg-red-100'    },
};

const DEFAULT_HUE = { bg: 'bg-gray-50', border: 'border-gray-100', icon: 'bg-gray-100' };

export function getMaterialIcon(name) {
  if (!name) return '🛒';
  const n = name.toLowerCase();
  for (const { keys, emoji } of ICON_MAP) {
    if (keys.some((k) => n.includes(k))) return emoji;
  }
  return '🛒';
}

export function getMaterialHue(name) {
  if (!name) return DEFAULT_HUE;
  const n = name.toLowerCase();
  for (const { keys, hue } of ICON_MAP) {
    if (keys.some((k) => n.includes(k))) return HUE_CLASSES[hue] ?? DEFAULT_HUE;
  }
  return DEFAULT_HUE;
}
