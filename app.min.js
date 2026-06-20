/* =====================================================================
 * SHIB Mini App — Telegram WebApp Frontend (single-file IIFE)
 * ---------------------------------------------------------------------
 * Inject into your Telegram WebApp HTML:
 *   <script src="https://telegram.org/js/telegram-web-app.js"></script>
 *   <script src="app.min.js"></script>
 * ===================================================================== */
(function () {
  "use strict";

  // ============ CONFIG ============
  var API_URL    = "https://silent-block-bedf.ahmedrabieharoun.workers.dev";
  var BOT_USER   = "YourBotUsername"; // without @
  var COIN_NAME  = "SHIB";
  var COIN_ICON  = "🐕";

  // ============ STATE ============
  var TG    = window.Telegram && window.Telegram.WebApp;
  var token = null;
  var state = { user: null, recent: [], tasks: [], refs: [], refsTotal: 0 };
  var view  = "home";

  if (TG) { try { TG.ready(); TG.expand(); TG.setHeaderColor("#0a0a0a"); TG.setBackgroundColor("#0a0a0a"); } catch (e) {} }

  // ============ DEVICE FINGERPRINT ============
  function deviceId() {
    var cached = localStorage.getItem("dev_fp");
    if (cached) return cached;
    var c = document.createElement("canvas");
    var ctx = c.getContext("2d");
    ctx.textBaseline = "top"; ctx.font = "14px Arial";
    ctx.fillText("fp", 2, 2);
    var fp = [
      navigator.userAgent, navigator.language, screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(), c.toDataURL().slice(-64),
    ].join("|");
    localStorage.setItem("dev_fp", fp);
    return fp;
  }

  // ============ API ============
  function api(action, data) {
    var headers = { "Content-Type": "application/json", "X-Action": action };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(API_URL, {
      method: "POST", headers, body: JSON.stringify(data || {}),
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  // ============ CSS ============
  var CSS = `
:root{
  --bg:#0a0a0a; --bg2:#111; --glass:rgba(255,255,255,.04); --glass-border:rgba(255,255,255,.08);
  --orange:#ff7a18; --orange2:#ff9d3f; --orange-glow:rgba(255,122,24,.35);
  --text:#fff; --muted:#8a8a8a; --green:#22c55e; --red:#ef4444;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  height:100%;overflow:hidden;font-size:14px}
body{background:radial-gradient(ellipse at top,#1a0f08 0%,#0a0a0a 50%) fixed}
#app{height:100vh;display:flex;flex-direction:column;max-width:480px;margin:0 auto;position:relative}
.scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:16px 16px 100px;scrollbar-width:none}
.scroll::-webkit-scrollbar{display:none}
.glass{background:var(--glass);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border:1px solid var(--glass-border);border-radius:20px}
.btn{background:linear-gradient(135deg,var(--orange),var(--orange2));color:#fff;border:none;border-radius:16px;
  padding:16px;font-size:15px;font-weight:600;cursor:pointer;width:100%;
  box-shadow:0 8px 24px var(--orange-glow);transition:transform .15s,box-shadow .15s}
.btn:active{transform:scale(.97)}
.btn-ghost{background:var(--glass);border:1px solid var(--glass-border);box-shadow:none;color:var(--text)}
.btn-sm{padding:10px 16px;font-size:13px;width:auto;border-radius:12px}

/* Header */
.topbar{display:flex;align-items:center;gap:12px;padding:16px 16px 0}
.avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--orange),var(--orange2));
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;overflow:hidden;flex-shrink:0}
.avatar img{width:100%;height:100%;object-fit:cover}
.topbar .greet{font-size:12px;color:var(--muted)}
.topbar .name{font-size:16px;font-weight:600;color:var(--orange)}

/* Balance card */
.balance-card{padding:24px;text-align:center;margin-top:16px;position:relative;overflow:hidden}
.balance-card::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% -20%,var(--orange-glow),transparent 60%);pointer-events:none}
.balance-label{font-size:11px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px}
.balance-amt{font-size:42px;font-weight:700;letter-spacing:-1px;display:flex;justify-content:center;align-items:baseline;gap:8px}
.balance-amt .ic{font-size:32px}
.balance-amt .cur{font-size:14px;color:var(--orange);font-weight:600;letter-spacing:1px}

/* Stats grid */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
.stat{padding:14px 10px;text-align:center}
.stat .lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.stat .v{font-size:18px;font-weight:700;color:var(--orange)}

/* Invite */
.invite{display:flex;align-items:center;gap:14px;padding:16px;margin-top:14px;background:linear-gradient(135deg,var(--orange),var(--orange2));
  border-radius:20px;color:#fff;cursor:pointer;box-shadow:0 10px 30px var(--orange-glow)}
.invite .ic{width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px}
.invite .ttl{font-size:16px;font-weight:700}
.invite .sub{font-size:12px;opacity:.9;margin-top:2px}

/* Section title */
.section-h{display:flex;justify-content:space-between;align-items:center;margin:22px 4px 12px}
.section-h .t{font-size:15px;font-weight:600}
.section-h .a{font-size:12px;color:var(--orange)}

/* Reward row */
.rew-row{display:flex;align-items:center;gap:12px;padding:14px;margin-bottom:8px}
.rew-row .dot{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:rgba(34,197,94,.15);color:var(--green);font-size:18px;flex-shrink:0}
.rew-row .ttl{font-size:13px;font-weight:600}
.rew-row .amt{margin-left:auto;color:var(--green);font-weight:700;font-size:13px}
.rew-row .ts{font-size:11px;color:var(--muted)}

/* Banner */
.banner{display:flex;align-items:center;gap:14px;padding:18px;margin-top:14px;background:linear-gradient(135deg,#1a0f08,#0a0a0a);
  border:1px solid var(--glass-border);border-radius:20px}
.banner .rocket{font-size:40px}
.banner .ttl{font-size:15px;font-weight:700;color:var(--orange);margin-bottom:4px}
.banner .sub{font-size:12px;color:var(--muted);line-height:1.4}
.banner button{margin-top:10px}

/* Tasks tabs */
.tabs{display:flex;gap:6px;padding:6px;margin:14px 0;background:var(--glass);border-radius:14px}
.tab{flex:1;padding:10px;text-align:center;font-size:12px;font-weight:600;color:var(--muted);
  border-radius:10px;cursor:pointer;transition:all .2s}
.tab.active{background:linear-gradient(135deg,var(--orange),var(--orange2));color:#fff;box-shadow:0 4px 14px var(--orange-glow)}

/* Task row */
.task-row{display:flex;align-items:center;gap:12px;padding:14px;margin-bottom:8px}
.task-row .ic{width:42px;height:42px;border-radius:12px;background:rgba(255,122,24,.15);color:var(--orange);
  display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.task-row .ttl{font-size:14px;font-weight:600}
.task-row .rwd{font-size:12px;color:var(--orange);margin-top:2px}
.task-row .act{margin-left:auto}

/* Daily combo */
.combo{padding:18px;margin-bottom:14px}
.combo .h{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.combo .h .t{font-size:16px;font-weight:700}
.combo .h .timer{background:linear-gradient(135deg,var(--orange),var(--orange2));padding:6px 12px;border-radius:10px;font-size:12px;font-weight:600}
.combo .desc{text-align:center;font-size:12px;color:var(--muted);margin-bottom:14px}
.combo .slots{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.combo .slot{aspect-ratio:1;background:var(--glass);border:1px solid var(--glass-border);border-radius:14px;
  display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--muted)}

/* Referrals */
.ref-banner{padding:24px 18px;text-align:center;margin-bottom:14px;position:relative;overflow:hidden}
.ref-banner::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 0%,var(--orange-glow),transparent 60%)}
.ref-banner .ic{font-size:54px;margin-bottom:8px;position:relative}
.ref-banner .t{font-size:16px;font-weight:700;position:relative}
.ref-banner .t b{color:var(--orange)}
.ref-link-box{padding:14px;margin-top:14px;background:var(--glass);border:1px solid var(--glass-border);border-radius:14px;position:relative}
.ref-link-box .lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;text-align:center;margin-bottom:8px}
.ref-link-box .row{display:flex;gap:8px;align-items:center}
.ref-link-box input{flex:1;background:transparent;border:none;color:#fff;font-size:12px;font-family:inherit;outline:none}

.ref-row{display:flex;align-items:center;gap:12px;padding:12px 14px;margin-bottom:8px}
.ref-row .av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#555,#333);
  display:flex;align-items:center;justify-content:center;font-weight:600;overflow:hidden;flex-shrink:0}
.ref-row .av img{width:100%;height:100%;object-fit:cover}
.ref-row .nm{font-size:13px;font-weight:600}
.ref-row .dt{font-size:11px;color:var(--muted)}
.ref-row .ern{margin-left:auto;color:var(--orange);font-weight:700;font-size:13px;text-align:right}
.ref-row .ern .c{font-size:10px;color:var(--muted);font-weight:500}

/* Bottom Nav */
.nav{display:flex;background:rgba(10,10,10,.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-top:1px solid var(--glass-border);position:absolute;bottom:0;left:0;right:0;padding:8px 0 calc(8px + env(safe-area-inset-bottom))}
.nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;cursor:pointer;
  color:var(--muted);font-size:11px;font-weight:600;transition:color .2s}
.nav-item .ic{font-size:22px}
.nav-item.active{color:var(--orange)}

/* Modal */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  display:flex;align-items:flex-end;justify-content:center;z-index:100;animation:fade .2s}
.modal{width:100%;max-width:480px;background:#111;border-radius:24px 24px 0 0;padding:24px 20px;
  border-top:1px solid var(--glass-border);animation:slide .25s}
.modal h3{font-size:18px;margin-bottom:14px}
.modal input,.modal select,.modal textarea{width:100%;background:var(--glass);border:1px solid var(--glass-border);
  color:#fff;padding:14px;border-radius:12px;font-size:14px;font-family:inherit;margin-bottom:10px;outline:none}
.modal input:focus,.modal select:focus{border-color:var(--orange)}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes slide{from{transform:translateY(100%)}to{transform:translateY(0)}}

.toast{position:fixed;top:24px;left:50%;transform:translateX(-50%);background:#111;border:1px solid var(--glass-border);
  color:#fff;padding:12px 20px;border-radius:14px;font-size:13px;z-index:200;animation:fade .2s;max-width:90%}
.toast.err{border-color:var(--red)} .toast.ok{border-color:var(--green)}

.empty{padding:40px 20px;text-align:center;color:var(--muted);font-size:13px}
.spinner{width:28px;height:28px;border:3px solid var(--glass);border-top-color:var(--orange);border-radius:50%;
  animation:spin 1s linear infinite;margin:40px auto}
@keyframes spin{to{transform:rotate(360deg)}}
.loader-full{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg);z-index:1000}
`;

  // ============ HTML SHELL ============
  function shell() {
    return `
    <div id="loader" class="loader-full"><div class="spinner"></div></div>
    <div id="root" style="display:none;height:100%;display:flex;flex-direction:column">
      <div class="topbar">
        <div class="avatar" id="hdrAvatar"></div>
        <div>
          <div class="greet">Welcome back,</div>
          <div class="name" id="hdrName">User</div>
        </div>
      </div>
      <div class="scroll" id="scroll"></div>
      <div class="nav">
        <div class="nav-item active" data-v="home"><div class="ic">🏠</div>Home</div>
        <div class="nav-item" data-v="tasks"><div class="ic">✅</div>Tasks</div>
        <div class="nav-item" data-v="refs"><div class="ic">👥</div>Referrals</div>
      </div>
    </div>
    <div id="modalRoot"></div>
    <div id="toastRoot"></div>`;
  }

  // ============ HELPERS ============
  function $(s, p) { return (p || document).querySelector(s); }
  function fmt(n) { return (n || 0).toLocaleString("en-US"); }
  function ago(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }
  function date(ts) { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  function escapeHtml(s) { return String(s || "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

  function toast(msg, kind) {
    var el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    $("#toastRoot").appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }
  function closeModal() { $("#modalRoot").innerHTML = ""; }
  function modal(html) {
    $("#modalRoot").innerHTML = `<div class="modal-bg" id="mb"><div class="modal">${html}</div></div>`;
    $("#mb").addEventListener("click", function (e) { if (e.target.id === "mb") closeModal(); });
  }

  function refLink() { return "https://t.me/" + BOT_USER + "?start=" + (state.user ? state.user.id : ""); }

  // ============ HEADER RENDER ============
  function renderHeader() {
    var u = state.user; if (!u) return;
    $("#hdrName").textContent = u.first_name || u.username || "User";
    var av = $("#hdrAvatar");
    if (u.photo_url) {
      av.innerHTML = '<img src="' + u.photo_url + '" alt="">';
    } else {
      av.textContent = (u.first_name || u.username || "U").charAt(0).toUpperCase();
    }
  }

  // ============ VIEWS ============
  function viewHome() {
    var u = state.user || {};
    var rewards = (state.recent || []).map(function (r) {
      var label = ({ daily_login:"Daily Login", referral:"Referral Reward", task:"Task Reward", daily_combo:"Daily Combo", promo:"Promo Code" })[r.reason] || "Reward";
      return `<div class="glass rew-row">
        <div class="dot">+</div>
        <div><div class="ttl">${label}</div><div class="ts">${ago(r.ts)}</div></div>
        <div class="amt">+${fmt(r.amount)}</div></div>`;
    }).join("") || `<div class="empty">No rewards yet</div>`;

    return `
      <div class="glass balance-card">
        <div class="balance-label">Your Balance</div>
        <div class="balance-amt"><span class="ic">${COIN_ICON}</span>${fmt(u.balance)} <span class="cur">${COIN_NAME}</span></div>
      </div>
      <div class="stats">
        <div class="glass stat"><div class="lbl">Referrals</div><div class="v">${fmt(u.referrals_count)}</div></div>
        <div class="glass stat"><div class="lbl">Active</div><div class="v">${fmt(u.active_referrals)}</div></div>
        <div class="glass stat"><div class="lbl">Earned</div><div class="v">${fmt(u.total_earned)}</div></div>
      </div>
      <div class="invite" id="inviteBtn">
        <div class="ic">✈️</div>
        <div><div class="ttl">Invite Friends</div><div class="sub">Earn ${25}% of their earnings</div></div>
      </div>
      <div class="section-h"><div class="t">Recent Rewards</div></div>
      ${rewards}
      <div class="banner">
        <div class="rocket">🚀</div>
        <div>
          <div class="ttl">Big Rewards Await!</div>
          <div class="sub">Invite friends, complete tasks and earn huge rewards in ${COIN_NAME}!</div>
          <button class="btn btn-sm" id="goTasks" style="margin-top:10px">Let's Go!</button>
        </div>
      </div>
      <div class="section-h"><div class="t">Wallet</div></div>
      <button class="btn" id="openWithdraw">Withdraw ${COIN_NAME}</button>
    `;
  }

  var taskTab = "channel";
  function viewTasks() {
    var filtered = (state.tasks || []).filter(function (t) {
      if (taskTab === "channel") return t.type === "channel";
      if (taskTab === "bot")     return t.type === "bot";
      if (taskTab === "invite")  return t.type === "invite";
      return true;
    });
    var rows = filtered.length ? filtered.map(function (t) {
      var btn = t.status === "done"
        ? `<span style="color:var(--green);font-size:18px">✓</span>`
        : t.status === "started"
          ? `<button class="btn btn-sm" data-verify="${t.id}">Verify</button>`
          : `<button class="btn btn-sm" data-start="${t.id}" data-link="${escapeHtml(t.link)}">Join</button>`;
      return `<div class="glass task-row">
        <div class="ic">${t.icon || "📢"}</div>
        <div><div class="ttl">${escapeHtml(t.title)}</div><div class="rwd">+${fmt(t.reward)} ${COIN_NAME}</div></div>
        <div class="act">${btn}</div></div>`;
    }).join("") : `<div class="empty">No tasks available</div>`;

    return `
      <div class="glass combo">
        <div class="h"><div class="t">Daily Combo</div><div class="timer">⏱ 23:45:18</div></div>
        <div class="desc">Find the correct combination and claim ${fmt(REWARDS_UI.daily_combo)} ${COIN_NAME}</div>
        <div class="slots">${[1,2,3,4].map(function(){return '<div class="slot">?</div>'}).join("")}</div>
        <button class="btn" style="margin-top:14px" id="claimDaily">Claim Daily Login +${fmt(REWARDS_UI.daily_login)}</button>
      </div>
      <div class="tabs">
        <div class="tab ${taskTab==="channel"?"active":""}" data-tab="channel">Channels</div>
        <div class="tab ${taskTab==="bot"?"active":""}" data-tab="bot">Bots</div>
        <div class="tab ${taskTab==="invite"?"active":""}" data-tab="invite">Invites</div>
      </div>
      ${rows}
      <button class="btn btn-ghost" id="addTask" style="margin-top:14px">+ Submit Task</button>
    `;
  }
  var REWARDS_UI = { daily_combo: 5000, daily_login: 500 };

  function viewRefs() {
    var u = state.user || {};
    var rows = (state.refs || []).length ? state.refs.map(function (r) {
      var initial = (r.name || "U").charAt(0).toUpperCase();
      var av = r.photo ? `<img src="${r.photo}" alt="">` : initial;
      return `<div class="glass ref-row">
        <div class="av">${av}</div>
        <div><div class="nm">${escapeHtml(r.name || "User")}</div><div class="dt">${date(r.ts)}</div></div>
        <div class="ern">+${fmt(r.earned || 0)}<div class="c">${COIN_NAME}</div></div>
      </div>`;
    }).join("") : `<div class="empty">No referrals yet — share your link!</div>`;

    return `
      <div class="glass ref-banner">
        <div class="ic">🎉</div>
        <div class="t">Invite friends and earn <b>25% of their earnings!</b></div>
        <div class="ref-link-box">
          <div class="lbl">Your Referral Link</div>
          <div class="row">
            <input id="refLinkInp" readonly value="${refLink()}">
            <button class="btn btn-sm" id="copyRef">Copy</button>
          </div>
        </div>
      </div>
      <div class="stats">
        <div class="glass stat"><div class="lbl">Total</div><div class="v">${fmt(u.referrals_count)}</div></div>
        <div class="glass stat"><div class="lbl">Active</div><div class="v">${fmt(u.active_referrals)}</div></div>
        <div class="glass stat"><div class="lbl">Earned</div><div class="v">${fmt(u.referral_earned)}</div></div>
      </div>
      <div class="section-h"><div class="t">Referral List</div></div>
      ${rows}
    `;
  }

  // ============ RENDER ============
  function render() {
    renderHeader();
    var html = view === "home" ? viewHome() : view === "tasks" ? viewTasks() : viewRefs();
    $("#scroll").innerHTML = html;
    document.querySelectorAll(".nav-item").forEach(function (n) {
      n.classList.toggle("active", n.dataset.v === view);
    });
    bind();
  }

  // ============ BINDINGS ============
  function bind() {
    document.querySelectorAll(".nav-item").forEach(function (n) {
      n.onclick = function () { view = n.dataset.v; if (view==="tasks") loadTasks(); if (view==="refs") loadRefs(); render(); };
    });
    var ib = $("#inviteBtn"); if (ib) ib.onclick = shareInvite;
    var gt = $("#goTasks");   if (gt) gt.onclick = function () { view = "tasks"; loadTasks(); render(); };
    var ow = $("#openWithdraw"); if (ow) ow.onclick = openWithdraw;

    // Tasks
    document.querySelectorAll("[data-tab]").forEach(function (t) {
      t.onclick = function () { taskTab = t.dataset.tab; render(); };
    });
    document.querySelectorAll("[data-start]").forEach(function (b) {
      b.onclick = function () { startTask(b.dataset.start, b.dataset.link); };
    });
    document.querySelectorAll("[data-verify]").forEach(function (b) {
      b.onclick = function () { verifyTask(b.dataset.verify); };
    });
    var cd = $("#claimDaily"); if (cd) cd.onclick = claimDaily;
    var at = $("#addTask"); if (at) at.onclick = openAddTask;

    // Refs
    var cr = $("#copyRef"); if (cr) cr.onclick = copyRef;
  }

  // ============ ACTIONS ============
  function shareInvite() {
    var url = refLink();
    var txt = "Join me on " + COIN_NAME + " App and earn rewards! " + url;
    if (TG && TG.openTelegramLink) {
      TG.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent("Join me and earn " + COIN_NAME + "!"));
    } else if (navigator.share) {
      navigator.share({ text: txt }).catch(function(){});
    } else {
      navigator.clipboard.writeText(url); toast("Link copied!", "ok");
    }
  }
  function copyRef() {
    var inp = $("#refLinkInp"); inp.select();
    navigator.clipboard.writeText(inp.value).then(function () { toast("Copied!", "ok"); });
  }

  function startTask(id, link) {
    api("startTask", { taskId: id }).then(function (r) {
      if (r.body.error) return toast(r.body.error, "err");
      if (link && TG && TG.openTelegramLink && /t\.me/.test(link)) TG.openTelegramLink(link);
      else if (link) window.open(link, "_blank");
      toast("Joined. Verify in a few seconds.", "ok");
      setTimeout(loadTasks, 2000);
    });
  }
  function verifyTask(id) {
    api("verifyTask", { taskId: id }).then(function (r) {
      if (r.body.error) return toast(r.body.error, "err");
      toast("+" + fmt(r.body.reward) + " " + COIN_NAME, "ok");
      state.user.balance = r.body.balance;
      loadTasks(); loadState();
    });
  }
  function claimDaily() {
    api("claimDaily", {}).then(function (r) {
      if (r.body.error) return toast(r.body.error === "ALREADY_CLAIMED" ? "Come back tomorrow" : r.body.error, "err");
      toast("+" + fmt(r.body.reward) + " " + COIN_NAME, "ok"); loadState();
    });
  }

  function openAddTask() {
    modal(`<h3>Submit a Task</h3>
      <input id="t_ti" placeholder="Title">
      <input id="t_li" placeholder="Link (https://t.me/...)">
      <select id="t_ty"><option value="channel">Channel</option><option value="bot">Bot</option></select>
      <button class="btn" id="t_sb">Submit for Review</button>
      <button class="btn btn-ghost" style="margin-top:8px" onclick="document.getElementById('mb').click()">Cancel</button>`);
    $("#t_sb").onclick = function () {
      var title = $("#t_ti").value.trim(), link = $("#t_li").value.trim(), type = $("#t_ty").value;
      if (!title || !link) return toast("Fill all fields", "err");
      api("submitTask", { title, link, type }).then(function (r) {
        if (r.body.error) return toast(r.body.error, "err");
        toast("Submitted for review", "ok"); closeModal();
      });
    };
  }

  function openWithdraw() {
    var u = state.user || {};
    modal(`<h3>Withdraw</h3>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Balance: ${fmt(u.balance)} ${COIN_NAME} · 50,000 ${COIN_NAME} = 1 TON</div>
      <select id="w_cu"><option value="TON">TON (min 1)</option><option value="USDT">USDT (min 5)</option></select>
      <input id="w_ad" placeholder="Wallet Address">
      <input id="w_am" type="number" placeholder="Amount">
      <button class="btn" id="w_sb">Request Withdraw</button>
      <button class="btn btn-ghost" style="margin-top:8px" onclick="document.getElementById('mb').click()">Cancel</button>`);
    $("#w_sb").onclick = function () {
      api("withdraw", { currency: $("#w_cu").value, address: $("#w_ad").value.trim(), amount: Number($("#w_am").value) })
        .then(function (r) {
          if (r.body.error) return toast(r.body.error, "err");
          toast("Withdraw requested", "ok"); closeModal(); loadState();
        });
    };
  }

  // ============ DATA LOADING ============
  function loadState() {
    return api("getState", {}).then(function (r) {
      if (r.body.user) { state.user = r.body.user; state.recent = r.body.recent_rewards || []; render(); }
    });
  }
  function loadTasks() { return api("getTasks", {}).then(function (r) { state.tasks = r.body.tasks || []; render(); }); }
  function loadRefs()  { return api("getReferrals", { offset:0, limit:50 }).then(function (r) { state.refs = r.body.items || []; state.refsTotal = r.body.total || 0; render(); }); }

  // ============ BOOT ============
  function boot() {
    var style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
    document.body.innerHTML = ""; document.body.insertAdjacentHTML("beforeend", shell());

    var initData = (TG && TG.initData) || "";
    if (!initData) {
      document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#fff;font-family:sans-serif">Open this app inside Telegram.</div>';
      return;
    }
    api("auth", { initData, device: deviceId() }).then(function (r) {
      if (r.body.error) {
        document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;font-family:sans-serif">'
          + (r.body.error === "DEVICE_TAKEN" ? "Another account is registered on this device." : r.body.error) + '</div>';
        return;
      }
      token = r.body.token; state.user = r.body.user;
      $("#loader").style.display = "none"; $("#root").style.display = "flex";
      render();
      loadState();
    }).catch(function (e) {
      document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;font-family:sans-serif">Connection failed: ' + e.message + '</div>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
