function UserBar({ user, onLogout }) {
  // Shared account strip appears at the top of authenticated pages.
  return (
    <div className="mb-5 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 px-5 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
      <div>
        <strong className="block text-lg font-semibold text-stone-50">
          {user.name}
        </strong>
      </div>
      <button type="button" className="ghost-btn" onClick={onLogout}>
        Logout
      </button>
    </div>
  )
}

export default UserBar
