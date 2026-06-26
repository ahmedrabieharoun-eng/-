/**
 * ════════════════════════════════════════════════════════════════════
 *  anti-fraud-frontend.js
 *  نظام بصمة الجهاز + Device ID دائم — للإضافة في index.html
 *
 *  كيفية الاستخدام:
 *  1. أضف هذا الملف قبل إغلاق </body> في index.html:
 *       <script src="anti-fraud-frontend.js"></script>
 *  2. عند إرسال أي طلب API، أضف بيانات الجهاز في الـ body:
 *       const fraud = await window.AntiFraud.collect();
 *       body._deviceFingerprint = fraud.fingerprint;
 *       body._deviceId         = fraud.deviceId;
 *  3. أرسل هذه البيانات مع كل طلب — السيرفر هو من يقرر.
 * ════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const DB_NAME   = 'antifraud_db';
  const DB_VER    = 1;
  const STORE     = 'kv';
  const DID_KEY   = '__device_id__';
  const LS_DID    = '__did__';

  // ──────────────────────────────────────────────────────────────────
  //  مساعد: SHA-256 للمتصفح
  // ──────────────────────────────────────────────────────────────────
  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ──────────────────────────────────────────────────────────────────
  //  مساعد: قراءة/كتابة IndexedDB (Promise-based)
  // ──────────────────────────────────────────────────────────────────
  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
      req.onsuccess  = e => res(e.target.result);
      req.onerror    = () => rej(req.error);
    });
  }

  async function idbGet(key) {
    try {
      const db = await openDB();
      return new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => res(req.result ?? null);
        req.onerror   = () => rej(req.error);
      });
    } catch (_) { return null; }
  }

  async function idbSet(key, value) {
    try {
      const db = await openDB();
      return new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => res();
        tx.onerror    = () => rej(tx.error);
      });
    } catch (_) {}
  }

  // ──────────────────────────────────────────────────────────────────
  //  Device ID — يُولّد مرة واحدة ويُحفظ في LocalStorage + IndexedDB
  // ──────────────────────────────────────────────────────────────────
  async function getOrCreateDeviceId() {
    // 1. جرّب LocalStorage أولاً (أسرع)
    let did = null;
    try { did = localStorage.getItem(LS_DID); } catch (_) {}

    // 2. جرّب IndexedDB (يصمد بعد حذف LocalStorage)
    if (!did) {
      did = await idbGet(DID_KEY);
    }

    // 3. إنشاء جديد لو لا يوجد
    if (!did || typeof did !== 'string' || did.length < 16) {
      const arr = new Uint8Array(24);
      crypto.getRandomValues(arr);
      did = 'did_' + [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // حفظ في كلا المكانين
    try { localStorage.setItem(LS_DID, did); } catch (_) {}
    await idbSet(DID_KEY, did);

    return did;
  }

  // ──────────────────────────────────────────────────────────────────
  //  Canvas Fingerprint
  // ──────────────────────────────────────────────────────────────────
  function canvasFingerprint() {
    try {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 50;
      const ctx = c.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('AntiFraud🔐', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('AntiFraud🔐', 4, 17);
      return c.toDataURL().slice(-64); // آخر 64 حرف كافية
    } catch (_) { return 'canvas_blocked'; }
  }

  // ──────────────────────────────────────────────────────────────────
  //  WebGL Fingerprint
  // ──────────────────────────────────────────────────────────────────
  function webglFingerprint() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return { vendor: 'no_webgl', renderer: 'no_webgl' };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        vendor:   ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR),
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    } catch (_) { return { vendor: 'err', renderer: 'err' }; }
  }

  // ──────────────────────────────────────────────────────────────────
  //  Audio Fingerprint (بدون تشغيل صوت)
  // ──────────────────────────────────────────────────────────────────
  function audioFingerprint() {
    try {
      const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!AudioCtx) return 'no_audio_ctx';
      const ctx = new AudioCtx(1, 44100, 44100);
      const osc = ctx.createOscillator();
      const analyser = ctx.createAnalyser();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      osc.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      // نأخذ قيم الـ sample rate والـ maxChannelCount كبديل غير async
      return `${ctx.sampleRate}_${ctx.destination.maxChannelCount}_${ctx.destination.channelCount}`;
    } catch (_) { return 'audio_err'; }
  }

  // ──────────────────────────────────────────────────────────────────
  //  كشف Headless Browser / Emulator / DevTools
  // ──────────────────────────────────────────────────────────────────
  function detectSuspiciousEnv() {
    const flags = {};

    // Headless Chrome
    flags.headless = !!(
      navigator.webdriver ||
      window._phantom ||
      window.__nightmare ||
      (navigator.userAgent || '').toLowerCase().includes('headless')
    );

    // Emulator hints
    flags.emulator = !!(
      (navigator.userAgent || '').includes('Android SDK built for x86') ||
      (navigator.userAgent || '').includes('Genymotion') ||
      (navigator.userAgent || '').includes('generic')
    );

    // DevTools (تقدير مبدئي بسيط — لا يُعتمد وحده)
    const before = performance.now();
    // eslint-disable-next-line no-debugger
    debugger; // سيُوقف التنفيذ لو DevTools مفتوح، ويزيد الوقت بشكل ملحوظ
    const after = performance.now();
    flags.devtools = (after - before) > 100;

    // Touch vs Mouse — أجهزة وهمية أحياناً لا تدعم Touch
    flags.noTouch = !('ontouchstart' in window) && !navigator.maxTouchPoints;

    return flags;
  }

  // ──────────────────────────────────────────────────────────────────
  //  جمع كل بيانات البصمة
  // ──────────────────────────────────────────────────────────────────
  async function buildFingerprint() {
    const nav = navigator;
    const scr = screen;
    const gl  = webglFingerprint();

    const raw = {
      ua:          nav.userAgent         || '',
      platform:    nav.platform          || '',
      vendor:      nav.vendor            || '',
      language:    nav.language          || '',
      languages:   (nav.languages || []).join(','),
      tz:          Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      tzOffset:    new Date().getTimezoneOffset(),
      screenW:     scr.width,
      screenH:     scr.height,
      colorDepth:  scr.colorDepth,
      pixelRatio:  window.devicePixelRatio || 1,
      hardConcur:  nav.hardwareConcurrency || 0,
      devMem:      nav.deviceMemory       || 0,
      maxTouch:    nav.maxTouchPoints     || 0,
      cookieEnabled: nav.cookieEnabled,
      doNotTrack:  nav.doNotTrack        || '',
      hasLS:       (() => { try { localStorage.setItem('__t__', 1); localStorage.removeItem('__t__'); return true; } catch (_) { return false; } })(),
      hasSS:       (() => { try { sessionStorage.setItem('__t__', 1); sessionStorage.removeItem('__t__'); return true; } catch (_) { return false; } })(),
      hasIDB:      !!window.indexedDB,
      canvasHash:  canvasFingerprint(),
      glVendor:    gl.vendor,
      glRenderer:  gl.renderer,
      audioSig:    audioFingerprint(),
    };

    const rawStr = JSON.stringify(raw);
    const hash   = await sha256(rawStr);

    return { hash, raw };
  }

  // ──────────────────────────────────────────────────────────────────
  //  واجهة عامة — window.AntiFraud
  // ──────────────────────────────────────────────────────────────────
  window.AntiFraud = {
    /**
     * collect() — استدعها قبل كل طلب API
     * ترجع: { fingerprint: string, deviceId: string, suspiciousFlags: object }
     * الوقت المستغرق: < 500ms في العادة
     */
    async collect() {
      const t0 = performance.now();

      const [fpResult, deviceId, suspicious] = await Promise.all([
        buildFingerprint(),
        getOrCreateDeviceId(),
        Promise.resolve(detectSuspiciousEnv()),
      ]);

      const elapsed = Math.round(performance.now() - t0);

      return {
        fingerprint:     fpResult.hash,
        deviceId,
        suspiciousFlags: suspicious,
        collectionMs:    elapsed,
      };
    },

    /**
     * attach(body) — أضف بيانات الجهاز إلى body الطلب
     * مثال: const body = await AntiFraud.attach({ action: 'getState', data: {} });
     */
    async attach(body = {}) {
      const fraud = await this.collect();
      return {
        ...body,
        _deviceFingerprint: fraud.fingerprint,
        _deviceId:          fraud.deviceId,
        _suspiciousFlags:   fraud.suspiciousFlags,
      };
    },
  };

  console.log('[AntiFraud] Fingerprint module loaded ✓');
})();
