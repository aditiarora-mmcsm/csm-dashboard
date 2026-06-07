import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? 'razorpay.com';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code     = searchParams.get('code');
  const next     = searchParams.get('next') ?? '/dashboard';
  const errorP   = searchParams.get('error');

  // OAuth error from Google/Supabase
  if (errorP) {
    console.error('[auth/callback] OAuth error:', errorP);
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(errorP)}`);
  }

  if (code) {
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message);
      return NextResponse.redirect(`${origin}/auth/login?error=auth`);
    }

    // Domain restriction check
    const email = data.session?.user.email ?? '';
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/auth/login?error=domain`);
    }

    // Ensure user row exists (the trigger handles new signups,
    // but run an upsert here as a safety net)
    const { user } = data.session!;
    await supabase.from('users').upsert({
      id:         user.id,
      email:      user.email!,
      name:       user.user_metadata?.full_name ?? user.email!.split('@')[0],
      avatar_url: user.user_metadata?.avatar_url ?? null,
    }, { onConflict: 'id', ignoreDuplicates: true });

    // Redirect to the originally requested page (or dashboard)
    const redirectTo = next.startsWith('/') ? `${origin}${next}` : `${origin}/dashboard`;
    return NextResponse.redirect(redirectTo);
  }

  // No code — something went wrong
  return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
}
