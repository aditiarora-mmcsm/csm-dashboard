/**
 * MM CSM Dashboard – Supabase Data Bridge
 * ─────────────────────────────────────────────────────────────────
 * Loaded as the very first <script> inside <body> of dashboard.html.
 * Responsibilities:
 *   1. Auth check  → redirect to /auth/login if no session
 *   2. Data sync   → pull all Supabase dashboard_store rows into localStorage
 *   3. Write-through → intercept localStorage.setItem to mirror writes to Supabase
 *   4. Real-time   → subscribe to remote changes and sync them back
 *   5. Role gates  → apply CSS / disable controls based on role
 *   6. SPOC filter → auto-set SPOC filter dropdowns for SPOC role
 *
 * window.__SB_URL__, window.__SB_KEY__, window.__USER__ are injected
 * by the Next.js dashboard route handler BEFORE this script runs.
 */

(async function DashboardBridge() {
  'use strict';

  // ── 0. Guard ────────────────────────────────────────────────────
  if (!window.__SB_URL__ || !window.__SB_KEY__) {
    console.error('[Bridge] Supabase config not injected. Aborting.');
    return;
  }

  // ── 1. Initialise Supabase client ──────────────────────────────
  const sb = window.supabase.createClient(window.__SB_URL__, window.__SB_KEY__, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  window._sb = sb;

  // ── 2. Auth check ───────────────────────────────────────────────
  const { data: { session }, error: sessErr } = await sb.auth.getSession();
  if (sessErr || !session) {
    window.location.href = '/auth/login?next=/dashboard';
    return;
  }

  // ── 3. Get user profile (injected by server, but refresh for freshness) ──
  const user = window.__USER__ || {};
  const role      = user.role       || 'spoc';
  const spocName  = user.spoc_name  || '';
  const userName  = user.name       || session.user.email?.split('@')[0] || 'User';
  window._currentUser = user;

  // ── 4. Show loading overlay ─────────────────────────────────────
  // (The overlay is injected by the route handler before this script)
  function hideOverlay() {
    const el = document.getElementById('_db_loading_overlay');
    if (el) el.remove();
  }

  // ── 5. All localStorage keys used by the dashboard ─────────────
  const STORE_KEYS = [
    'csm_etb_ntb', 'csm_etb_extra',
    'csm_pg_data',  'csm_pg_extra',
    'csm_hv_data',  'csm_hv_extra',
    'csm_amb_portfolio', 'csm_drop_alerts',
    'csm_bb_portfolio',
    'csm_yearly_targets', 'csm_monthly_targets', 'csm_product_targets',
    'csm_testimonials', 'csm_meetings', 'csm_review_docs',
    'csm_pipeline_amb', 'csm_pipeline_tpn', 'csm_pipeline_fav',
    'csm_pipeline_saas', 'csm_pipeline_sc',
    'csm_alpha_accounts', 'csm_ppc_view',
    'csm_5cr_amb_extra', 'csm_5cr_amb_data',
  ];

  // ── 6. Pull data from Supabase → localStorage ───────────────────
  try {
    // Main keys
    const { data: mainRows } = await sb
      .from('dashboard_store')
      .select('key, value')
      .in('key', STORE_KEYS);

    // Pattern-based keys (merchant notes: csm_m360_notes_*)
    const { data: noteRows } = await sb
      .from('dashboard_store')
      .select('key, value')
      .like('key', 'csm_m360_notes_%');

    const allRows = [...(mainRows || []), ...(noteRows || [])];
    let _inBridgeWrite = false;

    allRows.forEach(({ key, value }) => {
      if (value !== null && value !== undefined) {
        _inBridgeWrite = true;
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
        _inBridgeWrite = false;
      }
    });

    // ── 7. Write-through: intercept localStorage.setItem ──────────
    const _origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function bridgeSetItem(key, value) {
      _origSetItem(key, value);

      // Only sync csm_* keys; skip if we're in our own write; skip read-only roles
      if (_inBridgeWrite)             return;
      if (!key.startsWith('csm_'))    return;
      if (role === 'leadership')      return; // read-only

      let parsed;
      try { parsed = JSON.parse(value); } catch (e) { parsed = value; }

      sb.from('dashboard_store')
        .upsert(
          { key, value: parsed, updated_by: session.user.id, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        )
        .then(({ error }) => {
          if (error) console.warn('[Bridge] Sync error for', key, ':', error.message);
        });
    };

    // Make the original available for bridge-internal use
    localStorage.setItem.__orig = _origSetItem;

    // ── 8. Real-time: pull remote changes from other users ────────
    sb.channel('bridge_realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'dashboard_store',
      }, (payload) => {
        const { key, value, updated_by } = payload.new || {};
        if (!key || updated_by === session.user.id) return; // ignore own writes

        _inBridgeWrite = true;
        try {
          if (value !== null && value !== undefined) {
            _origSetItem(key, JSON.stringify(value));
          }
        } catch (e) {}
        _inBridgeWrite = false;

        // Nudge the dashboard to re-render the changed module
        _nudgeRerender(key);
      })
      .subscribe();

  } catch (syncErr) {
    console.warn('[Bridge] Initial sync failed:', syncErr);
    // Non-fatal – dashboard continues with existing localStorage data
  }

  // ── 9. Apply role-based UI rules ────────────────────────────────
  document.documentElement.setAttribute('data-role', role);

  const styleEl = document.createElement('style');
  styleEl.id = '_bridge_role_css';

  if (role === 'leadership') {
    // Leadership = read-only: hide all write controls
    styleEl.textContent = `
      [data-role="leadership"] .btn-primary,
      [data-role="leadership"] .admin-only,
      [data-role="leadership"] input[type="file"],
      [data-role="leadership"] [onclick*="openETB"],
      [data-role="leadership"] [onclick*="openPG"],
      [data-role="leadership"] [onclick*="openHV"],
      [data-role="leadership"] [onclick*="delete"],
      [data-role="leadership"] [onclick*="save"],
      [data-role="leadership"] [onclick*="Upload"],
      [data-role="leadership"] [onclick*="upload"] { display: none !important; }
    `;
  } else if (role === 'spoc') {
    // SPOC: hide admin-only elements
    styleEl.textContent = `
      [data-role="spoc"] .admin-only { display: none !important; }
    `;
  }
  // admin: no restrictions

  document.head.appendChild(styleEl);

  // ── 10. DOM-ready enhancements ───────────────────────────────────
  function onDOMReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  onDOMReady(function () {
    // ── 10a. Topbar: show user name + role badge ─────────────────
    const avatar = document.getElementById('topbar-avatar');
    if (avatar) {
      avatar.textContent = (userName[0] || 'U').toUpperCase();
      avatar.title = session.user.email + ' · ' + role;
      avatar.style.cursor = 'help';
    }

    // Add role badge next to avatar
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      const badgeColors = { admin: '#2563EB', spoc: '#16A34A', leadership: '#7C3AED' };
      const badge = document.createElement('span');
      badge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
      badge.style.cssText = [
        'font-size:11px', 'font-weight:700', 'padding:3px 9px', 'border-radius:20px',
        'background:' + (badgeColors[role] || '#64748B') + '20',
        'color:' + (badgeColors[role] || '#64748B'),
        'border:1.5px solid ' + (badgeColors[role] || '#64748B') + '40',
        'margin-right:6px',
      ].join(';');
      topbar.insertBefore(badge, avatar ? avatar.nextSibling : null);

      // Sign-out button
      const signOutBtn = document.createElement('button');
      signOutBtn.title = 'Sign out';
      signOutBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
      signOutBtn.style.cssText = 'border:none;background:none;cursor:pointer;color:#94A3B8;padding:6px 8px;border-radius:8px;display:flex;align-items:center;margin-left:4px';
      signOutBtn.onmouseenter = () => { signOutBtn.style.background = '#F1F5F9'; signOutBtn.style.color = '#DC2626'; };
      signOutBtn.onmouseleave = () => { signOutBtn.style.background = 'none';    signOutBtn.style.color = '#94A3B8'; };
      signOutBtn.onclick = async () => {
        await sb.auth.signOut();
        window.location.href = '/auth/login';
      };
      topbar.appendChild(signOutBtn);
    }

    // ── 10b. SPOC: auto-set SPOC filter dropdowns ────────────────
    if (role === 'spoc' && spocName) {
      setTimeout(function () {
        document.querySelectorAll('select').forEach(function (sel) {
          if (!sel.id) return;
          const isSpocSel = sel.id.toLowerCase().includes('spoc') || sel.id.toLowerCase().includes('am');
          if (!isSpocSel) return;
          for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === spocName || sel.options[i].text === spocName) {
              sel.selectedIndex = i;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        });
      }, 800); // slight delay to allow renders to complete
    }

    // ── 10c. Add "Live" indicator to topbar ──────────────────────
    if (topbar) {
      const liveEl = document.createElement('span');
      liveEl.id = '_bridge_live';
      liveEl.title = 'Data synced with Supabase · live updates active';
      liveEl.style.cssText = 'font-size:11px;color:#16A34A;font-weight:700;display:flex;align-items:center;gap:4px;margin-right:8px';
      liveEl.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#16A34A;animation:_pulse 2s ease infinite;display:inline-block"></span>Live';
      const title = topbar.querySelector('.topbar-title');
      if (title && title.nextSibling) topbar.insertBefore(liveEl, title.nextSibling);
      else topbar.appendChild(liveEl);
    }
  });

  // ── 11. Remove loading overlay ───────────────────────────────────
  hideOverlay();

  // ── 12. CSS animation for Live dot ──────────────────────────────
  const animEl = document.createElement('style');
  animEl.textContent = '@keyframes _pulse { 0%,100%{opacity:1} 50%{opacity:.4} }';
  document.head.appendChild(animEl);

})(); // end DashboardBridge

// ─────────────────────────────────────────────────────────────────
// Helper: trigger dashboard re-render when a specific key changes
// Calls the existing render functions already defined in the dashboard.
// ─────────────────────────────────────────────────────────────────
function _nudgeRerender(key) {
  const map = {
    csm_etb_ntb:       function() { if (typeof renderETBNTB         === 'function') renderETBNTB(); },
    csm_etb_extra:     function() { if (typeof renderETBNTB         === 'function') renderETBNTB(); },
    csm_pg_data:       function() { if (typeof renderPGSettlement    === 'function') renderPGSettlement(); },
    csm_pg_extra:      function() { if (typeof renderPGSettlement    === 'function') renderPGSettlement(); },
    csm_hv_data:       function() { if (typeof renderHV              === 'function') renderHV(); },
    csm_hv_extra:      function() { if (typeof renderHV              === 'function') renderHV(); },
    csm_amb_portfolio: function() { if (typeof renderAMBPortfolio    === 'function') renderAMBPortfolio(); },
    csm_drop_alerts:   function() { if (typeof _updateSlackAlertBtn  === 'function') _updateSlackAlertBtn(); },
    csm_bb_portfolio:  function() { if (typeof renderBBPortfolio     === 'function') renderBBPortfolio(); },
    csm_meetings:      function() { if (typeof renderMeetings        === 'function') renderMeetings(); },
    csm_testimonials:  function() { if (typeof renderTestimonials    === 'function') renderTestimonials(); },
  };
  const fn = map[key];
  if (fn) {
    try { fn(); } catch (e) { /* ignore render errors from re-render attempts */ }
  }
}
