import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? 'razorpay.com';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  const next  = searchParams.get('next') ?? '/dashboard';
  const errorP = searchParams.get('error');

  if (errorP) {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(errorP)}`);
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(`${origin}/auth/login?error=auth`);
    }

    const email = data.session?.user.email ?? '';
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/auth/login?error=domain`);
    }

    const { user } = data.session!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('users').upsert({
      id:         user.id,
      email:      user.email!,
      name:       user.user_metadata?.full_name ?? user.email!.split('@')[0],
      avatar_url: user.user_metadata?.avatar_url ?? null,
    }, { onConflict: 'id', ignoreDuplicates: true });

    const redirectTo = next.startsWith('/') ? `${origin}${next}` : `${origin}/dashboard`;
    return NextResponse.redirect(redirectTo);
  }

  return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
}
