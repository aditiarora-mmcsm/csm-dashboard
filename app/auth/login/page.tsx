'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? 'razorpay.com';

function LoginContent() {
  const supabase    = createClient();
  const params      = useSearchParams();
  const nextPath    = params.get('next') || '/dashboard';
  const errorParam  = params.get('error');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (errorParam === 'domain') {
      setError(`Only @${ALLOWED_DOMAIN} accounts are allowed.`);
    }
  }, [errorParam]);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        queryParams: {
          // Hint to Google to only show the allowed domain
          hd: ALLOWED_DOMAIN,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success, browser navigates away — no need to setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '48px 40px',
        width: '100%', maxWidth: '420px', textAlign: 'center',
        boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{
          width: 56, height: 56, background: '#2563EB', borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg viewBox="0 0 24 24" style={{ width: 28, height: 28, fill: 'none', stroke: '#fff', strokeWidth: 2 }}>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>

        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: '#0F172A' }}>
          MM CSM Dashboard
        </h1>
        <p style={{ margin: '0 0 32px', fontSize: 14, color: '#64748B' }}>
          Razorpay Mid-Market Customer Success
        </p>

        {error && (
          <div style={{
            background: '#FFF1F2', border: '1.5px solid #FECDD3', borderRadius: 10,
            padding: '12px 16px', marginBottom: 24, color: '#BE123C', fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          style={{
            width: '100%', padding: '14px 20px', border: '1.5px solid #E2E8F0',
            borderRadius: 12, background: loading ? '#F8FAFC' : '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            fontSize: 15, fontWeight: 600, color: '#0F172A',
            transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#F8FAFC'; }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
        >
          {loading ? (
            <span style={{
              width: 20, height: 20, border: '2.5px solid #CBD5E1',
              borderTopColor: '#2563EB', borderRadius: '50%',
              animation: 'spin 0.7s linear infinite', display: 'inline-block',
            }}/>
          ) : (
            /* Google G icon */
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </button>

        <p style={{ margin: '24px 0 0', fontSize: 13, color: '#94A3B8' }}>
          Only <strong>@{ALLOWED_DOMAIN}</strong> accounts are authorised.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
