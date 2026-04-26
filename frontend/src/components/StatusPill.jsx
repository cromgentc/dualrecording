const toneClasses = {
  // Tones keep status colors consistent across dashboards and studio panels.
  default: 'bg-amber-300/15 text-amber-200',
  accent: 'bg-amber-300/15 text-amber-200',
  success: 'bg-emerald-300/15 text-emerald-200',
  muted: 'bg-stone-300/15 text-stone-200',
}

function StatusPill({ tone = 'default', children }) {
  return (
    <span
      className={`inline-flex min-w-24 items-center justify-center rounded-full px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] ${toneClasses[tone] || toneClasses.default}`}
    >
      {children}
    </span>
  )
}

export default StatusPill
