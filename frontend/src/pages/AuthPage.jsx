import { useState } from 'react'
import ToastMessage from '../components/ToastMessage'
import { apiRequest } from '../lib/podcast'

function AuthPage({ onAuthenticated }) {
  // Auth page is a three-mode flow: login, register, and password recovery.
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [forgotStep, setForgotStep] = useState('request')
  const [forgotChannel, setForgotChannel] = useState('email')
  const [otpPreview, setOtpPreview] = useState(null)
  const [recovery, setRecovery] = useState({
    recoveryId: '',
    resetToken: '',
    channel: 'email',
  })
  const [loginForm, setLoginForm] = useState({
    identifier: '',
    password: '',
  })
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
  })
  const [forgotRequestForm, setForgotRequestForm] = useState({
    email: '',
    mobile: '',
  })
  const [forgotVerifyForm, setForgotVerifyForm] = useState({
    otp: '',
  })
  const [resetForm, setResetForm] = useState({
    newPassword: '',
    confirmPassword: '',
  })

  function resetMessages() {
    setMessage('')
  }

  function activateMode(nextMode) {
    // Switching modes clears transient recovery state so old OTPs do not leak across UI.
    setMode(nextMode)
    setBusy(false)
    setMessage('')
    setOtpPreview(null)
    if (nextMode !== 'forgot') {
      setForgotStep('request')
      setForgotChannel('email')
      setRecovery({
        recoveryId: '',
        resetToken: '',
        channel: 'email',
      })
    }
  }

  async function handleLogin(event) {
    event.preventDefault()
    setBusy(true)
    resetMessages()

    try {
      const payload = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      })
      onAuthenticated(payload)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()
    setBusy(true)
    resetMessages()

    // Confirm locally before asking the backend to create an account.
    if (registerForm.password !== registerForm.confirmPassword) {
      setBusy(false)
      setMessage('Password and confirm password must match.')
      return
    }

    try {
      const payload = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: registerForm.name,
          email: registerForm.email,
          mobile: registerForm.mobile,
          role: 'user',
          password: registerForm.password,
        }),
      })
      onAuthenticated(payload)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleForgotRequest(event) {
    event.preventDefault()
    setBusy(true)
    resetMessages()

    try {
      const payload = await apiRequest('/api/auth/forgot/request', {
        method: 'POST',
        body: JSON.stringify({
          channel: forgotChannel,
          ...(forgotChannel === 'mobile'
            ? { mobile: forgotRequestForm.mobile }
            : { email: forgotRequestForm.email }),
        }),
      })

      // Keep recovery identifiers from the request step for verify/reset calls.
      setRecovery((current) => ({
        ...current,
        recoveryId: payload.recoveryId,
        channel: payload.channel || forgotChannel,
      }))
      setOtpPreview(payload.devOtpPreview || null)
      setForgotStep('verify')
      setMessage('OTP sent successfully. Continue to the next step for verification.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleForgotVerify(event) {
    event.preventDefault()
    setBusy(true)
    resetMessages()

    try {
      const payload = await apiRequest('/api/auth/forgot/verify', {
        method: 'POST',
        body: JSON.stringify({
          recoveryId: recovery.recoveryId,
          otp: forgotVerifyForm.otp,
        }),
      })

      setRecovery((current) => ({
        ...current,
        resetToken: payload.resetToken,
        channel: payload.channel || current.channel,
      }))
      setForgotStep('reset')
      setMessage('OTP validated. Create a new password.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault()
    setBusy(true)
    resetMessages()

    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setBusy(false)
      setMessage('New password and confirm password must match.')
      return
    }

    try {
      const payload = await apiRequest('/api/auth/forgot/reset', {
        method: 'POST',
        body: JSON.stringify({
          recoveryId: recovery.recoveryId,
          resetToken: recovery.resetToken,
          newPassword: resetForm.newPassword,
        }),
      })

      setLoginForm((current) => ({
        ...current,
        identifier: forgotRequestForm.email || forgotRequestForm.mobile,
      }))
      setForgotStep('request')
      setRecovery({
        recoveryId: '',
        resetToken: '',
        channel: 'email',
      })
      setForgotChannel('email')
      setOtpPreview(null)
      setForgotVerifyForm({
        otp: '',
      })
      setResetForm({
        newPassword: '',
        confirmPassword: '',
      })
      setMode('login')
      setMessage(payload.message)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  function renderHeader() {
    // Header copy changes with the current auth mode and recovery step.
    if (mode === 'register') {
      return {
        eyebrow: 'Create Account',
        title: 'Register new account',
        description: 'Create a new user with name, email, mobile, and password.',
      }
    }

    if (mode === 'forgot') {
      return {
        eyebrow: 'Password Recovery',
        title:
          forgotStep === 'request'
            ? 'Forgot password'
            : forgotStep === 'verify'
              ? 'Verify OTP'
              : 'Create new password',
        description:
          forgotStep === 'request'
            ? 'Choose email or mobile number to start OTP verification.'
            : forgotStep === 'verify'
              ? `Validate the OTP sent to the selected ${forgotChannel === 'mobile' ? 'mobile number' : 'email'}.`
              : 'Set a new password after verification is complete.',
      }
    }

    return {
      eyebrow: 'Podcast Login',
      title: 'Welcome back',
      description: 'After login, users and admins will be redirected to their own pages.',
    }
  }

  const header = renderHeader()

  function renderFooterLinks() {
    // Footer navigation keeps users inside the same auth card.
    if (mode === 'login') {
      return (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-300">
          <button
            type="button"
            className="text-amber-200 transition hover:text-amber-100"
            onClick={() => activateMode('register')}
          >
            Create new account
          </button>
          <button
            type="button"
            className="text-amber-200 transition hover:text-amber-100"
            onClick={() => activateMode('forgot')}
          >
            Forgot password?
          </button>
        </div>
      )
    }

    if (mode === 'register') {
      return (
        <div className="mt-6 text-sm text-stone-300">
          Already have an account?{' '}
          <button
            type="button"
            className="text-amber-200 transition hover:text-amber-100"
            onClick={() => activateMode('login')}
          >
            Login here
          </button>
        </div>
      )
    }

    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-300">
        <button
          type="button"
          className="text-amber-200 transition hover:text-amber-100"
          onClick={() => activateMode('login')}
        >
          Back to login
        </button>
        <button
          type="button"
          className="text-amber-200 transition hover:text-amber-100"
          onClick={() => activateMode('register')}
        >
          Create new account
        </button>
      </div>
    )
  }

  return (
    <main className="page-shell relative flex min-h-screen items-center justify-center overflow-hidden py-10">
      <ToastMessage message={message} tone="error" onClose={() => setMessage('')} />
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-8%] top-[8%] h-56 w-56 rounded-full bg-cyan-400/18 blur-3xl animate-pulse" />
        <div className="absolute right-[-4%] top-[18%] h-72 w-72 rounded-full bg-amber-300/16 blur-3xl animate-pulse [animation-delay:700ms]" />
        <div className="absolute bottom-[6%] left-[18%] h-64 w-64 rounded-full bg-rose-400/14 blur-3xl animate-pulse [animation-delay:1400ms]" />
      </div>

      <section className="glass-card w-full max-w-xl p-8 md:p-10">
        <div className="mb-8">
          <p className="eyebrow">{header.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-stone-50 md:text-5xl">
            {header.title}
          </h1>
          <p className="mt-4 text-sm leading-6 text-stone-300">{header.description}</p>
        </div>

        {mode === 'login' ? (
          <form className="space-y-5" onSubmit={handleLogin}>
            <label className="block">
              <span className="eyebrow">Email Or Mobile</span>
              <input
                className="field mt-2"
                type="text"
                value={loginForm.identifier}
                onChange={(event) =>
                  setLoginForm((current) => ({
                    ...current,
                    identifier: event.target.value,
                  }))
                }
                placeholder="Email ya mobile number"
              />
            </label>

            <label className="block">
              <span className="eyebrow">Password</span>
              <input
                className="field mt-2"
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                placeholder="Enter password"
              />
            </label>

            <button className="primary-btn mt-2 w-full" type="submit" disabled={busy}>
              {busy ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : null}

        {mode === 'register' ? (
          <form className="space-y-5" onSubmit={handleRegister}>
            <label className="block">
              <span className="eyebrow">Full Name</span>
              <input
                className="field mt-2"
                type="text"
                value={registerForm.name}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Enter full name"
              />
            </label>

            <label className="block">
              <span className="eyebrow">Email</span>
              <input
                className="field mt-2"
                type="email"
                value={registerForm.email}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="eyebrow">Mobile</span>
              <input
                className="field mt-2"
                type="tel"
                value={registerForm.mobile}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    mobile: event.target.value,
                  }))
                }
                placeholder="Mobile number"
              />
            </label>

            <label className="block">
              <span className="eyebrow">Password</span>
              <input
                className="field mt-2"
                type="password"
                value={registerForm.password}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                placeholder="Minimum 6 characters"
              />
            </label>

            <label className="block">
              <span className="eyebrow">Confirm Password</span>
              <input
                className="field mt-2"
                type="password"
                value={registerForm.confirmPassword}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
                  }))
                }
                placeholder="Re-enter password"
              />
            </label>

            <button className="primary-btn mt-2 w-full" type="submit" disabled={busy}>
              {busy ? 'Creating account...' : 'Register'}
            </button>
          </form>
        ) : null}

        {mode === 'forgot' && forgotStep === 'request' ? (
          <form className="space-y-5" onSubmit={handleForgotRequest}>
            <div className="grid w-full grid-cols-2 gap-2 rounded-full border border-white/10 bg-white/5 p-1.5">
              <button
                type="button"
                className={forgotChannel === 'email' ? 'tab-btn-active' : 'tab-btn'}
                onClick={() => {
                  setForgotChannel('email')
                  setMessage('')
                }}
              >
                Email
              </button>
              <button
                type="button"
                className={forgotChannel === 'mobile' ? 'tab-btn-active' : 'tab-btn'}
                onClick={() => {
                  setForgotChannel('mobile')
                  setMessage('')
                }}
              >
                Mobile
              </button>
            </div>

            {forgotChannel === 'email' ? (
              <label className="block">
                <span className="eyebrow">Registered Email</span>
                <input
                  className="field mt-2"
                  type="email"
                  value={forgotRequestForm.email}
                  onChange={(event) =>
                    setForgotRequestForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="Registered email"
                />
              </label>
            ) : (
              <label className="block">
                <span className="eyebrow">Registered Mobile</span>
                <input
                  className="field mt-2"
                  type="tel"
                  value={forgotRequestForm.mobile}
                  onChange={(event) =>
                    setForgotRequestForm((current) => ({
                      ...current,
                      mobile: event.target.value,
                    }))
                  }
                  placeholder="Registered mobile number"
                />
              </label>
            )}

            <button className="primary-btn mt-2 w-full" type="submit" disabled={busy}>
              {busy ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : null}

        {mode === 'forgot' && forgotStep === 'verify' ? (
          <form className="space-y-5" onSubmit={handleForgotVerify}>
            <label className="block">
              <span className="eyebrow">
                {recovery.channel === 'mobile' ? 'Mobile OTP' : 'Email OTP'}
              </span>
              <input
                className="field mt-2"
                type="text"
                value={forgotVerifyForm.otp}
                onChange={(event) =>
                  setForgotVerifyForm((current) => ({
                    ...current,
                    otp: event.target.value,
                  }))
                }
                placeholder={
                  recovery.channel === 'mobile'
                    ? 'Enter mobile OTP'
                    : 'Enter email OTP'
                }
              />
            </label>

            {otpPreview ? (
              <div className="rounded-3xl border border-amber-300/20 bg-amber-300/8 px-4 py-4 text-sm text-amber-100">
                <p className="font-semibold">Dev OTP Preview</p>
                <p className="mt-2">
                  {otpPreview.channel === 'mobile' ? 'Mobile OTP' : 'Email OTP'}:{' '}
                  {otpPreview.otp}
                </p>
              </div>
            ) : null}

            <button className="primary-btn mt-2 w-full" type="submit" disabled={busy}>
              {busy ? 'Verifying...' : 'Verify OTP'}
            </button>
          </form>
        ) : null}

        {mode === 'forgot' && forgotStep === 'reset' ? (
          <form className="space-y-5" onSubmit={handleResetPassword}>
            <label className="block">
              <span className="eyebrow">New Password</span>
              <input
                className="field mt-2"
                type="password"
                value={resetForm.newPassword}
                onChange={(event) =>
                  setResetForm((current) => ({
                    ...current,
                    newPassword: event.target.value,
                  }))
                }
                placeholder="Create new password"
              />
            </label>

            <label className="block">
              <span className="eyebrow">Confirm New Password</span>
              <input
                className="field mt-2"
                type="password"
                value={resetForm.confirmPassword}
                onChange={(event) =>
                  setResetForm((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
                  }))
                }
                placeholder="Re-enter new password"
              />
            </label>

            <button className="primary-btn mt-2 w-full" type="submit" disabled={busy}>
              {busy ? 'Updating password...' : 'Create New Password'}
            </button>
          </form>
        ) : null}

        {renderFooterLinks()}
      </section>
    </main>
  )
}

export default AuthPage
