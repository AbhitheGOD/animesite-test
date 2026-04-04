/* ─────────────────────────────────────────────────────────────────────────────
   AniScout shared.js — page transitions, hamburger nav, scroll reveal.
   Loaded by every page, placed just before </body>.
   ───────────────────────────────────────────────────────────────────────────── */

// ── Page Transitions ──────────────────────────────────────────────────────────
(function initPageTransitions() {
  // Fade the page in on first load
  document.body.style.opacity = '0';
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.body.style.transition = 'opacity 0.28s ease';
      document.body.style.opacity = '1';
    });
  });

  // Intercept internal link clicks and fade out before navigation
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');

    // Skip: no href, hash-only, external, mailto/tel/javascript, new tab, modifier keys
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('http') ||
      href.startsWith('//') ||
      href.startsWith('mailto') ||
      href.startsWith('tel') ||
      href.startsWith('javascript') ||
      link.target === '_blank' ||
      link.hasAttribute('data-no-transition') ||
      e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
    ) return;

    e.preventDefault();
    document.body.style.transition = 'opacity 0.18s ease';
    document.body.style.opacity = '0';
    const dest = href;
    setTimeout(function () { window.location.href = dest; }, 200);
  });
})();

// ── Mobile Nav Hamburger ──────────────────────────────────────────────────────
(function initHamburger() {
  const hamburger = document.getElementById('hamburger-btn');
  const mobileMenu = document.getElementById('mobile-nav-menu');
  if (!hamburger || !mobileMenu) return;

  function openMenu() {
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    mobileMenu.style.display = 'block';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { mobileMenu.classList.add('open'); });
    });
  }

  function closeMenu() {
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileMenu.classList.remove('open');
    setTimeout(function () {
      if (!mobileMenu.classList.contains('open')) mobileMenu.style.display = 'none';
    }, 280);
  }

  hamburger.addEventListener('click', function (e) {
    e.stopPropagation();
    mobileMenu.classList.contains('open') ? closeMenu() : openMenu();
  });

  document.addEventListener('click', function (e) {
    if (
      mobileMenu.classList.contains('open') &&
      !mobileMenu.contains(e.target) &&
      !hamburger.contains(e.target)
    ) closeMenu();
  });

  mobileMenu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });
  mobileMenu.querySelectorAll('button.mob-nav-item').forEach(function (btn) {
    btn.addEventListener('click', closeMenu);
  });
})();

// ── Floating Chat Widget ──────────────────────────────────────────────────────
(function initChatWidget() {
  if (window.location.pathname.includes('chat.html')) return;

  document.addEventListener('DOMContentLoaded', function () {
    const widget = document.createElement('div');
    widget.id = 'chat-widget';
    widget.innerHTML = `
      <div id="chat-widget-bubble" onclick="toggleChatWidget()" title="Open rooms chat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <span id="chat-widget-unread" class="chat-widget-unread-badge" style="display:none"></span>
      </div>
      <div id="chat-widget-panel" class="chat-widget-panel">
        <div class="chat-widget-header">
          <div class="chat-widget-header-left">
            <span class="chat-widget-title">Rooms</span>
            <span id="chat-widget-room-name" class="chat-widget-room-label"></span>
          </div>
          <div class="chat-widget-header-actions">
            <button id="chat-widget-back-btn" onclick="chatWidgetShowRoomList()" style="display:none" title="Back to rooms">←</button>
            <button onclick="toggleChatWidget()" title="Close">✕</button>
          </div>
        </div>
        <div id="chat-widget-body"></div>
        <div id="chat-widget-input-row" class="chat-widget-input-row" style="display:none">
          <input id="chat-widget-input" placeholder="Message…" maxlength="500" autocomplete="off" />
          <button id="chat-widget-send" onclick="chatWidgetSend()">↑</button>
        </div>
      </div>`;
    document.body.appendChild(widget);
  });
})();

let _widgetSb = null;
let _widgetUser = null;
let _widgetUsername = null;
let _widgetRooms = [];
let _widgetActiveRoomId = null;
let _widgetChannel = null;
let _widgetUnreadCounts = {};

async function _initWidgetSb() {
  if (_widgetSb) return;
  try {
    const res = await fetch('/api/supabase-config');
    const config = await res.json();
    if (!config.url || !config.anonKey) return;
    _widgetSb = supabase.createClient(config.url, config.anonKey);
    const { data: { session } } = await _widgetSb.auth.getSession();
    if (session) {
      _widgetUser = session.user;
      _widgetUsername = localStorage.getItem('aniscout_username');
    }
  } catch {}
}

function toggleChatWidget() {
  const panel = document.getElementById('chat-widget-panel');
  const isOpen = panel.classList.contains('open');
  if (!isOpen) {
    panel.classList.add('open');
    chatWidgetShowRoomList();
  } else {
    panel.classList.remove('open');
    const body = document.getElementById('chat-widget-body');
    if (body) body.innerHTML = '';
    const inputRow = document.getElementById('chat-widget-input-row');
    if (inputRow) inputRow.style.display = 'none';
    const input = document.getElementById('chat-widget-input');
    if (input) input.value = '';
  }
}

async function chatWidgetShowRoomList() {
  const body = document.getElementById('chat-widget-body');
  if (body) body.innerHTML = '<div class="chat-widget-empty">Loading…</div>';
  document.getElementById('chat-widget-back-btn').style.display = 'none';
  document.getElementById('chat-widget-room-name').textContent = '';
  document.getElementById('chat-widget-input-row').style.display = 'none';
  const input = document.getElementById('chat-widget-input');
  if (input) input.value = '';
  _widgetActiveRoomId = null;
  if (_widgetChannel) { _widgetSb && _widgetSb.removeChannel(_widgetChannel); _widgetChannel = null; }

  await _initWidgetSb();

  if (!_widgetSb || !_widgetUser) {
    body.innerHTML = '<div class="chat-widget-empty">Sign in to use rooms chat</div>';
    return;
  }

  body.innerHTML = '<div class="chat-widget-empty">Loading rooms…</div>';

  const { data: memberships } = await _widgetSb
    .from('room_members')
    .select('room_id, rooms(id, name, invite_code)')
    .eq('user_id', _widgetUser.id)
    .order('joined_at', { ascending: false });

  _widgetRooms = (memberships || []).map(function (m) { return m.rooms; }).filter(Boolean);

  if (!_widgetRooms.length) {
    body.innerHTML = '<div class="chat-widget-empty">No rooms yet.<br>Join or create one on the Rooms page.</div>';
    return;
  }

  const lastMsgs = {};
  await Promise.all(_widgetRooms.map(async function (r) {
    const { data } = await _widgetSb.from('messages').select('content, username, created_at')
      .eq('room_id', r.id).order('created_at', { ascending: false }).limit(1);
    if (data && data[0]) lastMsgs[r.id] = data[0];
  }));

  body.innerHTML = _widgetRooms.map(function (r) {
    const last = lastMsgs[r.id];
    const lastRead = parseInt(localStorage.getItem('aniscout_last_read_' + r.id) || '0');
    const hasUnread = last && new Date(last.created_at).getTime() > lastRead && last.username !== _widgetUsername;
    const preview = last ? last.username + ': ' + (last.content || '').slice(0, 35) : 'No messages yet';
    const safeName = r.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return '<div class="chat-widget-room-item" onclick="chatWidgetOpenRoom(\'' + r.id + '\', \'' + safeName + '\')">'
      + '<div style="flex:1;min-width:0">'
      + '<div class="chat-widget-room-item-name">' + r.name + '</div>'
      + '<div class="chat-widget-room-item-preview">' + preview + '</div>'
      + '</div>'
      + (hasUnread ? '<div class="chat-widget-unread-room-dot"></div>' : '')
      + '</div>';
  }).join('');

  _widgetRooms.forEach(function (r) {
    _widgetSb.channel('widget-notify-' + r.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room_id=eq.' + r.id }, function (payload) {
        if (payload.new.user_id === _widgetUser.id) return;
        _widgetUnreadCounts[r.id] = (_widgetUnreadCounts[r.id] || 0) + 1;
        const total = Object.values(_widgetUnreadCounts).reduce(function (a, b) { return a + b; }, 0);
        const badge = document.getElementById('chat-widget-unread');
        if (badge) { badge.style.display = 'flex'; badge.textContent = total > 9 ? '9+' : total; }
        if (!_widgetActiveRoomId && document.getElementById('chat-widget-panel').classList.contains('open')) {
          chatWidgetShowRoomList();
        }
      })
      .subscribe();
  });
}

async function chatWidgetOpenRoom(roomId, roomName) {
  _widgetActiveRoomId = roomId;
  localStorage.setItem('aniscout_last_read_' + roomId, Date.now());
  delete _widgetUnreadCounts[roomId];
  const total = Object.values(_widgetUnreadCounts).reduce(function (a, b) { return a + b; }, 0);
  const badge = document.getElementById('chat-widget-unread');
  if (badge) {
    if (total === 0) badge.style.display = 'none';
    else badge.textContent = total > 9 ? '9+' : total;
  }

  document.getElementById('chat-widget-room-name').textContent = roomName;
  document.getElementById('chat-widget-back-btn').style.display = 'block';
  document.getElementById('chat-widget-input-row').style.display = 'flex';

  const body = document.getElementById('chat-widget-body');
  body.innerHTML = '<div class="chat-widget-empty">Loading…</div>';

  const { data: msgs } = await _widgetSb.from('messages')
    .select('id, content, username, user_id, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(40);

  chatWidgetRenderMessages((msgs || []).reverse());

  if (_widgetChannel) _widgetSb.removeChannel(_widgetChannel);
  _widgetChannel = _widgetSb.channel('widget-room-' + roomId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room_id=eq.' + roomId }, function (payload) {
      if (_widgetUser && payload.new.user_id === _widgetUser.id) return;
      chatWidgetAppendMessage(payload.new);
    })
    .subscribe();

  const input = document.getElementById('chat-widget-input');
  input.onkeydown = function (e) { if (e.key === 'Enter') chatWidgetSend(); };
  input.focus();
}

function chatWidgetRenderMessages(msgs) {
  const body = document.getElementById('chat-widget-body');
  if (!msgs.length) { body.innerHTML = '<div class="chat-widget-empty">No messages yet. Say hi!</div>'; return; }
  body.innerHTML = msgs.map(chatWidgetMsgHTML).join('');
  body.scrollTop = body.scrollHeight;
}

function chatWidgetAppendMessage(m) {
  const body = document.getElementById('chat-widget-body');
  const empty = body.querySelector('.chat-widget-empty');
  if (empty) empty.remove();
  body.insertAdjacentHTML('beforeend', chatWidgetMsgHTML(m));
  body.scrollTop = body.scrollHeight;
  localStorage.setItem('aniscout_last_read_' + _widgetActiveRoomId, Date.now());
}

function chatWidgetMsgHTML(m) {
  const isMine = _widgetUser && m.user_id === _widgetUser.id;
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return '<div class="chat-widget-msg' + (isMine ? ' chat-widget-msg-mine' : '') + '">'
    + '<span class="chat-widget-msg-name">' + (m.username || 'User') + '</span>'
    + '<span class="chat-widget-msg-text">' + (m.content || '') + '</span>'
    + '<div class="chat-widget-msg-time">' + time + '</div>'
    + '</div>';
}

async function chatWidgetSend() {
  const input = document.getElementById('chat-widget-input');
  const content = (input.value || '').trim();
  if (!content || !_widgetActiveRoomId || !_widgetUser) return;
  input.value = '';

  // Optimistically render own message immediately
  chatWidgetAppendMessage({
    id: 'tmp-' + Date.now(),
    room_id: _widgetActiveRoomId,
    user_id: _widgetUser.id,
    username: _widgetUsername || 'You',
    content: content,
    created_at: new Date().toISOString()
  });

  const { error } = await _widgetSb.from('messages').insert({
    room_id: _widgetActiveRoomId,
    user_id: _widgetUser.id,
    username: _widgetUsername,
    content: content
  });

  if (error) console.error('Widget send failed:', error.message);
}

// ── Scroll Reveal (pages without their own IntersectionObserver) ──────────────
(function initScrollReveal() {
  // index.html manages its own observer — skip it there
  if (document.querySelector('meta[name="page-reveal"][content="native"]')) return;

  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  els.forEach(function (el) { obs.observe(el); });
})();
