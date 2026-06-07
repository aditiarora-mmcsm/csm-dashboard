import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? 'razorpay.com';
const PUBLIC_PATHS   = ['/auth/login', '/auth/callback', '/favicon.ico'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Let public paths through ──────────────────────────────
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── 2. Build a response we can mutate cookies on ─────────────
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // ── 3. Refresh session ────────────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession();

  // ── 4. No session → redirect to login ────────────────────────
  if (!session) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 5. Domain restriction (Razorpay emails only) ──────────────
  const email = session.user.email ?? '';
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    await supabase.auth.signOut();
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('error', 'domain');
    return NextResponse.redirect(loginUrl);
  }

  // ── 6. Attach role header for downstream use ──────────────────
  const { data: profile } = await supabase
    .from('users')
    .select('role, spoc_name')
    .eq('id', session.user.id)
    .single();

  response.headers.set('x-user-role',  profile?.role       ?? 'spoc');
  response.headers.set('x-user-spoc',  profile?.spoc_name  ?? '');
  response.headers.set('x-user-email', email);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image  (image optimisation)
     * - favicon.ico
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
