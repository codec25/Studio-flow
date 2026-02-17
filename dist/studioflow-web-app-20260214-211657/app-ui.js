(function () {
  const THEME_KEY = 'studioflow_theme';

  // --- ROLE-BASED NAVIGATION ---
  // Detects the user type using the session keys from app-api.js
  const isTeacher = !!localStorage.getItem('studioflow_teacher_session');
  const isStudent = !!localStorage.getItem('studioflow_student_session');

  const nav = [
    { href: 'index.html', label: 'Home', show: true },
    { href: 'admin.html', label: 'Dashboard', show: isTeacher },
    { href: 'clients.html', label: 'Clients', show: isTeacher },
    { href: 'services.html', label: 'Services', show: isTeacher },
    { href: 'book.html', label: 'Book', show: isStudent },
    { href: 'portal.html', label: 'My Account', show: isStudent },
  ].filter(item => item.show);

  function currentPath() {
    const file = location.pathname.split('/').pop();
    return file || 'index.html';
  }

  function injectStyle() {
    if (document.getElementById('sf-appbar-style')) return;
    const css = document.createElement('style');
    css.id = 'sf-appbar-style';
    css.textContent = `
      :root {
        --sf-bg: #f8fafc; --sf-text: #0f172a; --sf-muted: #64748b;
        --sf-line: #e2e8f0; --sf-surface: #ffffff; --sf-brand: #0f766e;
      }
      html.sf-dark {
        --sf-bg: #0b1220; --sf-text: #e5e7eb; --sf-muted: #94a3b8;
        --sf-line: #334155; --sf-surface: #111827; --sf-brand: #14b8a6;
      }
      html, body { background: var(--sf-bg) !important; color: var(--sf-text) !important; transition: background 0.2s; }
      body { padding-top: 78px !important; }

      .sf-appbar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 10000;
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px; background: color-mix(in oklab, var(--sf-surface) 88%, transparent);
        border-bottom: 1px solid var(--sf-line); backdrop-filter: blur(10px);
      }
      .sf-left, .sf-right, .sf-links { display: flex; align-items: center; gap: 8px; }
      .sf-links { overflow-x: auto; scrollbar-width: none; }
      .sf-brand { font-size: 13px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sf-brand); }
      
      .sf-btn {
        border-radius: 999px; border: 1px solid var(--sf-line);
        background: var(--sf-surface); color: var(--sf-text);
        padding: 7px 11px; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; text-decoration: none;
      }
      .sf-btn:hover { border-color: var(--sf-brand); color: var(--sf-brand); }
      .sf-btn.active { background: var(--sf-brand); border-color: var(--sf-brand); color: white; }
      .sf-logout { color: #ef4444 !important; border-color: transparent; }

      /* Dark Mode Overrides for standard Tailwind cards */
      html.sf-dark .card, html.sf-dark .field, html.sf-dark input {
        background-color: var(--sf-surface) !important;
        color: var(--sf-text) !important;
        border-color: var(--sf-line) !important;
      }
    `;
    document.head.appendChild(css);
  }

  function buildBar() {
    if (document.getElementById('sfAppBar')) return;
    const bar = document.createElement('div');
    bar.id = 'sfAppBar'; bar.className = 'sf-appbar';

    const left = document.createElement('div');
    left.className = 'sf-left';
    left.innerHTML = `<span class="sf-brand">StudioFlow</span>`;

    const links = document.createElement('div');
    links.className = 'sf-links';
    const here = currentPath();
    nav.forEach(item => {
      const a = document.createElement('a');
      a.href = item.href;
      a.className = 'sf-btn' + (item.href === here ? ' active' : '');
      a.textContent = item.label;
      links.appendChild(a);
    });
    left.appendChild(links);

    const right = document.createElement('div');
    right.className = 'sf-right';

    // Theme Toggle
    const themeBtn = document.createElement('button');
    themeBtn.className = 'sf-btn';
    themeBtn.textContent = getTheme() === 'dark' ? 'Light' : 'Dark';
    themeBtn.onclick = () => setTheme(getTheme() === 'dark' ? 'light' : 'dark');

    right.appendChild(themeBtn);

    // Logout Button (Only if logged in)
    if (isTeacher || isStudent) {
      const logoutBtn = document.createElement('button');
      logoutBtn.className = 'sf-btn sf-logout';
      logoutBtn.textContent = 'Exit';
      logoutBtn.onclick = () => {
        localStorage.removeItem('studioflow_teacher_session');
        localStorage.removeItem('studioflow_student_session');
        location.href = 'auth.html';
      };
      right.appendChild(logoutBtn);
    }

    bar.appendChild(left);
    bar.appendChild(right);
    document.body.prepend(bar);
  }

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.classList.toggle('sf-dark', theme === 'dark');
    const btn = document.querySelector('.sf-right .sf-btn');
    if (btn) btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
  }

  function init() {
    injectStyle();
    if (document.body && document.body.dataset.noAppbar !== 'true') buildBar();
    setTheme(getTheme());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();