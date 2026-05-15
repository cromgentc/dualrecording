import { useState } from 'react'
import { copyText } from '../lib/podcast'

function CopyRow({ label, value, compact = false }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    // Show a short success state only when the browser clipboard write succeeds.
    const didCopy = await copyText(value)
    if (!didCopy) {
      return
    }

    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="info-card flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <span className="eyebrow"> {label} </span>
        <strong
          className={`mt-2 block text-sm font-semibold text-stone-50 ${
            compact ? 'break-all lg:truncate lg:break-normal' : 'break-all'
          }`}
          title={value}
        >
          {value}
        </strong>
      </div>
      <button type="button" className="secondary-btn min-h-11 w-full shrink-0 sm:w-auto" onClick={handleCopy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export default CopyRow
