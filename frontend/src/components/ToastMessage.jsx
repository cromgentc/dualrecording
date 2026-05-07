import { useEffect } from 'react'

const toneClasses = {
  default: 'border-amber-300/25 bg-stone-950/95 text-stone-100',
  error: 'border-rose-300/30 bg-rose-950/95 text-rose-50',
}

function ToastMessage({ message, tone = 'default', onClose }) {
  useEffect(() => {
    if (!message || !onClose) {
      return undefined
    }

    const timeoutId = window.setTimeout(onClose, 3200)
    return () => window.clearTimeout(timeoutId)
  }, [message, onClose])

  if (!message) {
    return null
  }

  return (
    <div className="fixed right-4 top-4 z-[9999] w-[min(360px,calc(100%-32px))]">
      <div
        className={`rounded-2xl border px-4 py-3 text-sm font-medium shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl ${toneClasses[tone] || toneClasses.default}`}
      >
        {message}
      </div>
    </div>
  )
}

export default ToastMessage
