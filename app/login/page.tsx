'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

/*
 * mise — Login page
 * Recreated from the Claude Design handoff (Login.dc.html), Tailwind-only,
 * against the shared brand tokens/fonts. Left = auth form, right = design-only
 * visual panel (hidden on mobile). All existing Supabase auth logic preserved.
 */
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Preserved verbatim from the previous login page — email/password sign-in.
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  // Google OAuth is not configured in Supabase yet (no provider enabled, no
  // /auth/callback route for the PKCE exchange). Keep the button but no-op with
  // a warning until the OAuth flow is actually wired up.
  function handleGoogle() {
    console.warn('Google OAuth is not configured yet.')
  }

  return (
    <div className="grid min-h-screen grid-cols-1 font-sans text-ink md:grid-cols-2">
      {/* LEFT: form */}
      <div className="relative flex flex-col bg-cream px-6 py-10 md:px-14">
        <div className="flex items-baseline gap-px font-serif text-[28px] tracking-[-0.5px] text-forest">
          <span>mise</span>
          <span className="text-[32px] leading-[0] text-terracotta">.</span>
        </div>

        <div className="mx-auto my-auto w-full max-w-[380px] self-center py-10">
          <h1 className="mb-2 font-serif text-[52px] font-normal leading-none tracking-[-1px] text-ink">
            Welcome back.
          </h1>
          <p className="mb-[34px] text-[16px] text-ink-3">Your invoices are waiting.</p>

          <form onSubmit={handleLogin}>
            <label className="mb-[7px] block text-[13px] font-semibold text-ink-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.com"
              required
              className="mb-[18px] w-full rounded-[9px] border border-ink/20 bg-cream-surface px-[15px] py-[13px] text-[15px] text-ink outline-none focus:border-terracotta"
            />

            <label className="mb-[7px] block text-[13px] font-semibold text-ink-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              required
              className="mb-6 w-full rounded-[9px] border border-ink/20 bg-cream-surface px-[15px] py-[13px] text-[15px] text-ink outline-none focus:border-terracotta"
            />

            {error && <p className="mb-4 text-[13px] text-[#C0392B]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[9px] bg-terracotta py-[14px] text-[15px] font-semibold text-[#FDF8F0] shadow-[0_2px_8px_rgba(196,100,45,.3)] transition hover:bg-terracotta-hover disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="my-[22px] flex items-center gap-[14px]">
            <div className="h-px flex-1 bg-ink/[0.14]" />
            <span className="text-[13px] text-[#9A9384]">or</span>
            <div className="h-px flex-1 bg-ink/[0.14]" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            className="flex w-full items-center justify-center gap-[10px] rounded-[9px] border border-ink/20 bg-cream-surface py-[13px] text-[15px] font-semibold text-ink transition hover:bg-cream-surface-alt"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
            </svg>
            Continue with Google
          </button>

          <p className="mt-[30px] text-center text-[14px] text-ink-3">
            New to mise?{' '}
            <Link href="#" className="font-semibold text-forest hover:text-terracotta">
              Create an account
            </Link>
          </p>
        </div>
      </div>

      {/* RIGHT: visual (design-only, hidden on mobile) */}
      <div className="relative hidden flex-col justify-center bg-forest px-14 py-10 text-[#EDEFE8] md:flex">
        <div className="mx-auto w-full max-w-[440px]">
          {/* mini price tracker */}
          <div className="relative rounded-[16px] border border-[rgba(255,253,249,.12)] bg-[rgba(255,253,249,.05)] p-[22px]">
            <div className="mb-0.5 font-serif text-[21px] text-cream">Price tracker</div>
            <div className="mb-[18px] font-mono text-[12px] text-forest-light">Unit price · trailing 6 weeks</div>
            <svg viewBox="0 0 400 180" className="block h-auto w-full" preserveAspectRatio="none">
              <line x1="0" y1="45" x2="400" y2="45" stroke="rgba(255,253,249,.08)" strokeWidth="1" />
              <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,253,249,.08)" strokeWidth="1" />
              <line x1="0" y1="135" x2="400" y2="135" stroke="rgba(255,253,249,.08)" strokeWidth="1" />
              <polyline points="8,128 74,124 140,118 206,104 272,88 338,54 394,32" fill="none" stroke="#D97742" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="394" cy="32" r="5" fill="#D97742" />
              <polyline points="8,92 74,96 140,90 206,94 272,88 338,92 394,89" fill="none" stroke="#8FA79A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="8,80 74,88 140,100 206,110 272,126 338,138 394,150" fill="none" stroke="#C7D6CD" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="394" cy="150" r="5" fill="#C7D6CD" />
            </svg>
            <div className="mt-[14px] flex gap-[16px] font-mono text-[11px]">
              <span className="inline-flex items-center gap-[6px] text-[#F0A87E]"><span className="h-[3px] w-[9px] rounded-[2px] bg-[#D97742]" />Yellow onions</span>
              <span className="inline-flex items-center gap-[6px] text-forest-light"><span className="h-[3px] w-[9px] rounded-[2px] bg-[#8FA79A]" />Roma tomatoes</span>
              <span className="inline-flex items-center gap-[6px] text-[#C7D6CD]"><span className="h-[3px] w-[9px] rounded-[2px] bg-[#C7D6CD]" />Chicken thighs</span>
            </div>
            {/* callout */}
            <div className="absolute right-[24px] top-[70px] max-w-[190px] rounded-[10px] bg-ink px-[13px] py-[10px] shadow-[0_14px_30px_-12px_rgba(0,0,0,.55)]">
              <div className="font-mono text-[13px] font-semibold text-[#F0A87E]">Yellow onions ↑ 22% this week</div>
              <div className="mt-[3px] text-[11px] text-[#C7C0B4]">3 vendors compared</div>
            </div>
          </div>

          {/* quote */}
          <blockquote className="mt-10">
            <p className="mb-[14px] font-serif text-[27px] font-normal italic leading-[1.3] text-cream">
              &quot;The dashboard I check before my coffee.&quot;
            </p>
            <div className="text-[14px] text-forest-light">— Danielle Rivas, Cardo &amp; Vine</div>
          </blockquote>
        </div>

        <div className="absolute bottom-8 left-14 font-serif text-[20px] text-[rgba(247,243,237,.55)]">
          mise<span className="text-terracotta-hover">.</span>
        </div>
      </div>
    </div>
  )
}
