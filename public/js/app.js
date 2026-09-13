// ---------- Shared helpers used on every page ----------

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Not logged in');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function apiGet(url) { return api(url); }
function apiPost(url, body) { return api(url, { method: 'POST', body: JSON.stringify(body) }); }
function apiPut(url, body) { return api(url, { method: 'PUT', body: JSON.stringify(body) }); }
function apiDelete(url) { return api(url, { method: 'DELETE' }); }

function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

function daysOutBadgeClass(daysOut, threshold) {
  threshold = threshold || 7;
  if (daysOut >= threshold) return 'red';
  if (daysOut >= Math.ceil(threshold / 2)) return 'yellow';
  return 'green';
}

function fmtDate(d) {
  if (!d) return '\u2014';
  const dt = new Date(d + (d.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function initLogout() {
  const btn = document.getElementById('logoutBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      await apiPost('/api/logout', {});
      window.location.href = '/login.html';
    });
  }
}

function initNavToggle() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => links.classList.remove('open'));
  });
  document.addEventListener('click', (e) => {
    if (!links.contains(e.target) && !toggle.contains(e.target)) {
      links.classList.remove('open');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLogout();
  initNavToggle();
});
