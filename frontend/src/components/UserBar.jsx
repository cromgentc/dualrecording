function UserBar({ user, onLogout, compact = false }) {
  // Shared account strip appears at the top of authenticated pages.
  return (
    <div
      className={
        compact
          ? 'mb-5 flex items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl'
          : 'mb-5 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 px-5 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between'
      }
    >
      <div>
        <strong className={compact ? 'block text-sm font-semibold text-stone-50' : 'block text-lg font-semibold text-stone-50'}>
          {user.name}
        </strong>
      </div>
      <button type="button" className={compact ? 'ghost-btn px-4 py-2 text-sm' : 'ghost-btn'} onClick={onLogout}>
        Logout
      </button>
    </div>
  )
}

export default UserBar
