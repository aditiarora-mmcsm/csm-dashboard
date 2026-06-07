/**
 * Dashboard Route Handler
 * ─────────────────────────────────────────────────────────────────
 * Reads dashboard.html from /public, injects:
 *   - Loading overlay
 *   - Supabase config (public env vars)
 *   - Current user profile
 *   - Supabase JS SDK (CDN)
 *   - data-bridge.js
 * Then returns the modified HTML.
 *
 * The middleware.ts already guards this route (must be authenticated
 * + correct domain), so by the time we reach here the session is valid.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic'; // never cache – always auth-checked

export async function GET(request: NextRequest) {
  // ── 1. Server-side Supabase client ─────────────────────────────
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // ── 2. Fetch user profile ───────────────────────────────────────
  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, role, spoc_name, avatar_url')
    .eq('id', session.user.id)
    .single();

  const safeProfile = {
    id:         profile?.id         ?? session.user.id,
    email:      profile?.email      ?? session.user.email,
    name:       profile?.name       ?? session.user.email?.split('@')[0] ?? 'User',
    role:       profile?.role       ?? 'spoc',
    spoc_name:  profile?.spoc_name  ?? '',
    avatar_url: profile?.avatar_url ?? null,
  };

  // ── 3. Read dashboard HTML ──────────────────────────────────────
  let html: string;
  try {
    const htmlPath = join(process.cwd(), 'public', 'dashboard.html');
    html = readFileSync(htmlPath, 'utf-8');
  } catch {
    return new NextResponse(
      `<h2 style="font-family:sans-serif;color:#DC2626;padding:40px">
         dashboard.html not found in /public.<br>
         Copy your <code>dashboard_v2.html</code> to <code>public/dashboard.html</code> and redeploy.
       </h2>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // ── 4. Build injection block ────────────────────────────────────
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
  const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const injection = `
<!-- ═══ MM CSM Dashboard – Supabase Bridge ═══════════════════ -->
<div id="_db_loading_overlay" style="
  position:fixed;inset:0;background:#fff;z-index:99999;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  font-family:system-ui,-apple-system,sans-serif
">
  <div style="text-align:center">
    <div style="
      width:40px;height:40px;border-radius:12px;background:#2563EB;
      display:flex;align-items:center;justify-content:center;margin:0 auto 16px
    ">
      <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:#fff;stroke-width:2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    </div>
    <p style="color:#0F172A;font-weight:700;font-size:16px;margin:0 0 6px">MM CSM Dashboard</p>
    <p style="color:#64748B;font-size:13px;margin:0 0 20px">Syncing latest data…</p>
    <div style="
      width:36px;height:36px;border:3px solid #E2E8F0;border-top-color:#2563EB;
      border-radius:50%;animation:_bspin 0.7s linear infinite;margin:0 auto
    "></div>
  </div>
  <style>@keyframes _bspin{to{transform:rotate(360deg)}}</style>
</div>

<script>
/* Injected by Next.js dashboard route – DO NOT EDIT */
window.__SB_URL__  = ${JSON.stringify(supabaseUrl)};
window.__SB_KEY__  = ${JSON.stringify(supabaseKey)};
window.__USER__    = ${JSON.stringify(safeProfile)};
</script>

<!-- Supabase JS SDK -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>

<!-- Data Bridge (auth + sync + role gates) -->
<script src="/data-bridge.js"></script>
<!-- ═════════════════════════════════════════════════════════════ -->
`;

  // ── 5. Inject just after <body> (or <body ...>) ─────────────────
  if (html.includes('<body>')) {
    html = html.replace('<body>', '<body>\n' + injection);
  } else {
    // body with attributes
    html = html.replace(/<body([^>]*)>/i, (match) => match + '\n' + injection);
  }

  // ── 6. Return ───────────────────────────────────────────────────
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-User-Role':   safeProfile.role,
    },
  });
}
