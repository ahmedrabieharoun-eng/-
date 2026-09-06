/**
 * ========================================================================
 *  anti-fraud-frontend.js — بصمة الجهاز (Device Fingerprint) + حماية من
 *  تعدد الحسابات على مستوى الواجهة الأمامية.
 * ========================================================================
 *
 *  الفكرة: نولّد معرّفين مستقلّين لكل جهاز ونرسلهما مع كل طلب للسيرفر:
 *
 *   1) fingerprint  — بصمة "صلبة" مبنية من خصائص الجهاز/المتصفح نفسه
 *      (كارت الشاشة، الصوت، الشاشة، الخط، الأجهزة...). هذه البصمة لا
 *      تتغيّر حتى لو المستخدم مسح بيانات المتصفح (localStorage) لأنها
 *      لا تعتمد على أي تخزين — يتم اشتقاقها من الجهاز مباشرة في كل مرة.
 *
 *   2) deviceId     — معرّف عشوائي (UUID) يُخزَّن محليًا (localStorage +
 *      IndexedDB + Cookie كنسخ احتياطية من بعضها) عند أول زيارة، ويُعاد
 *      استخدامه في كل مرة بعد ذلك. يفيد في حالات نادرة تتشابه فيها بصمة
 *      الجهاز (fingerprint collision) بين جهازين مختلفين، ويُستخدم أيضًا
 *      كخط دفاع ثانٍ في حال تغيّر أحد مكوّنات البصمة (تحديث متصفح مثلًا).
 *
 *  ملحوظة أمان مهمة: هذا الملف لا يعتمد إطلاقًا على عنوان الـIP — الـIP
 *  يُقرأ من السيرفر فقط لأغراض إحصائية/تسجيل، ولا يُستخدم كعامل حاسم في
 *  اكتشاف تعدد الحسابات، لأن تغيير الـIP (VPN/شبكة الجوال...) لا يجب أن
 *  يسمح لأي مستخدم بتجاوز الحماية. القرار الفعلي يُتَّخذ بالكامل في
 *  السيرفر (server.js) بناءً على fingerprint/deviceId المُرسَلين من هنا.
 * ========================================================================
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'pmt_device_id_v1';
  var DB_NAME = 'pmt_af_store';
  var DB_STORE = 'kv';

  var _cache = null; // { fingerprint, deviceId, suspiciousFlags }
  var _pending = null;

  // ── أدوات صغيرة ────────────────────────────────────────────────────
  function safe(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
  }

  function uuid4() {
    if (global.crypto && global.crypto.randomUUID) {
      return safe(function () { return global.crypto.randomUUID(); }, null) || fallbackUuid();
    }
    return fallbackUuid();
  }

  function fallbackUuid() {
    var d = Date.now() + (performance && performance.now ? performance.now() : 0);
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async function sha256Hex(str) {
    try {
      if (global.crypto && global.crypto.subtle) {
        var enc = new TextEncoder().encode(str);
        var buf = await global.crypto.subtle.digest('SHA-256', enc);
        var bytes = Array.from(new Uint8Array(buf));
        return bytes.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      }
    } catch (_) {}
    // بديل بسيط جدًا (غير تشفيري) لو Web Crypto غير متاح — يكفي كخط دفاع
    // ثانٍ فقط، ولا يمثل ضعفًا خطيرًا لأن السيرفر لا يعتمد عليه وحده
    // (deviceId المخزَّن محليًا يظل خط الدفاع الأساسي في هذه الحالة النادرة).
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return 'fallback_' + Math.abs(hash).toString(16);
  }

  // ── مصادر البصمة (Fingerprint Sources) ──────────────────────────────
  function getCanvasFingerprint() {
    return safe(function () {
      var canvas = document.createElement('canvas');
      canvas.width = 220; canvas.height = 40;
      var ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 100, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('DeviceFP-\u0645-\u0646', 2, 15);
      ctx.strokeStyle = 'rgba(120,20,200,0.8)';
      ctx.beginPath();
      ctx.arc(60, 20, 15, 0, Math.PI * 2);
      ctx.stroke();
      return canvas.toDataURL();
    }, '');
  }

  function getWebglFingerprint() {
    return safe(function () {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return '';
      var info = gl.getExtension('WEBGL_debug_renderer_info');
      var vendor = info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      var renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      return [vendor, renderer, gl.getParameter(gl.VERSION), gl.getParameter(gl.SHADING_LANGUAGE_VERSION)].join('||');
    }, '');
  }

  function getAudioFingerprint() {
    return new Promise(function (resolve) {
      var AC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
      if (!AC) return resolve('');
      try {
        var ctx = new AC(1, 5000, 44100);
        var osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(10000, ctx.currentTime);
        var compressor = ctx.createDynamicsCompressor();
        [['threshold', -50], ['knee', 40], ['ratio', 12], ['attack', 0], ['release', 0.25]]
          .forEach(function (p) { if (compressor[p[0]]) compressor[p[0]].setValueAtTime(p[1], ctx.currentTime); });
        osc.connect(compressor);
        compressor.connect(ctx.destination);
        osc.start(0);
        var done = false;
        var finish = function (val) { if (!done) { done = true; resolve(val); } };
        ctx.oncomplete = function (e) {
          var out = e.renderedBuffer.getChannelData(0);
          var sum = 0;
          for (var i = 0; i < out.length; i += 100) sum += Math.abs(out[i]);
          finish('audio_' + sum.toFixed(6));
        };
        ctx.startRendering();
        setTimeout(function () { finish(''); }, 800); // لا نعطّل التحميل لو تأخر
      } catch (_) { resolve(''); }
    });
  }

  function getFontsSignal() {
    return safe(function () {
      var testFonts = ['Arial', 'Tahoma', 'Verdana', 'Times New Roman', 'Courier New',
        'Segoe UI', 'Noto Naskh Arabic', 'Geeza Pro', 'Dubai', 'Cairo'];
      var base = ['monospace', 'sans-serif', 'serif'];
      var span = document.createElement('span');
      span.style.cssText = 'position:absolute;left:-9999px;font-size:72px';
      span.textContent = 'mmmmmmmmmmlli';
      document.body.appendChild(span);
      var baseSizes = {};
      base.forEach(function (f) { span.style.fontFamily = f; baseSizes[f] = span.offsetWidth + 'x' + span.offsetHeight; });
      var detected = [];
      testFonts.forEach(function (font) {
        var match = base.some(function (b) {
          span.style.fontFamily = "'" + font + "'," + b;
          return (span.offsetWidth + 'x' + span.offsetHeight) !== baseSizes[b];
        });
        if (match) detected.push(font);
      });
      document.body.removeChild(span);
      return detected.join(',');
    }, '');
  }

  function getHardwareSignal() {
    return safe(function () {
      var scr = global.screen || {};
      return [
        navigator.platform || '',
        navigator.language || '',
        (navigator.languages || []).join(','),
        navigator.hardwareConcurrency || '',
        navigator.deviceMemory || '',
        navigator.maxTouchPoints || '',
        scr.width + 'x' + scr.height,
        scr.colorDepth || '',
        scr.pixelDepth || '',
        Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        new Date().getTimezoneOffset(),
        navigator.userAgent || '',
        ('ontouchstart' in global) ? 'touch' : 'notouch',
      ].join('||');
    }, '');
  }

  // ── إشارات الاشتباه (لا تُستخدم للحظر الفعلي في السيرفر، فقط للتسجيل) ──
  function getSuspiciousFlags() {
    return safe(function () {
      var nav = navigator || {};
      return {
        headless: !!nav.webdriver ||
          /HeadlessChrome/i.test(nav.userAgent || '') ||
          (typeof global.callPhantom !== 'undefined') ||
          (typeof global._phantom !== 'undefined'),
        emulator: safe(function () {
          // بعض المحاكيات الشائعة تترك آثارًا واضحة في User-Agent أو غياب لمسات الأجهزة الحقيقية
          var ua = (nav.userAgent || '').toLowerCase();
          return /sdk_gphone|emulator|genymotion|bluestacks|noxplayer|ldplayer|memuplay/i.test(ua);
        }, false),
        devtools: safe(function () {
          var threshold = 160;
          return (global.outerWidth - global.innerWidth > threshold) ||
                 (global.outerHeight - global.innerHeight > threshold);
        }, false),
      };
    }, { headless: false, emulator: false, devtools: false });
  }

  // ── تخزين ومسترجعة deviceId (مقاوِم للحذف الجزئي عبر نسخ متعددة) ────
  function idbGet(key) {
    return new Promise(function (resolve) {
      try {
        var req = global.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          req.result.createObjectStore(DB_STORE);
        };
        req.onsuccess = function () {
          try {
            var tx = req.result.transaction(DB_STORE, 'readonly');
            var getReq = tx.objectStore(DB_STORE).get(key);
            getReq.onsuccess = function () { resolve(getReq.result || null); };
            getReq.onerror = function () { resolve(null); };
          } catch (_) { resolve(null); }
        };
        req.onerror = function () { resolve(null); };
      } catch (_) { resolve(null); }
    });
  }

  function idbSet(key, value) {
    return new Promise(function (resolve) {
      try {
        var req = global.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          req.result.createObjectStore(DB_STORE);
        };
        req.onsuccess = function () {
          try {
            var tx = req.result.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).put(value, key);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { resolve(false); };
          } catch (_) { resolve(false); }
        };
        req.onerror = function () { resolve(false); };
      } catch (_) { resolve(false); }
    });
  }

  function getCookie(name) {
    return safe(function () {
      var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    }, null);
  }

  function setCookie(name, value) {
    safe(function () {
      var oneYear = 365 * 24 * 60 * 60;
      document.cookie = name + '=' + encodeURIComponent(value) +
        ';max-age=' + oneYear + ';path=/;SameSite=Lax';
    });
  }

  // يجمع نفس القيمة من كل مصادر التخزين المتاحة، ويوحّدها إذا اختلفت
  // (يفضّل أقدم قيمة موجودة بدلًا من توليد واحدة جديدة، لتقليل فرصة
  // إنشاء deviceId جديد لمجرد أن أحد أماكن التخزين تم مسحه يدويًا).
  async function getOrCreateDeviceId() {
    var fromLocal = safe(function () { return global.localStorage.getItem(STORAGE_KEY); }, null);
    var fromCookie = getCookie(STORAGE_KEY);
    var fromIdb = await idbGet(STORAGE_KEY);

    var existing = fromLocal || fromCookie || fromIdb;
    var id = existing || uuid4();

    // إعادة نشر نفس القيمة لكل الأماكن (يعيد بناء أي مكان ناقص).
    safe(function () { global.localStorage.setItem(STORAGE_KEY, id); });
    setCookie(STORAGE_KEY, id);
    await idbSet(STORAGE_KEY, id).catch(function () {});

    return id;
  }

  // ── التجميع النهائي ──────────────────────────────────────────────────
  //
  // ملحوظة مهمة (تحديث): بالإضافة للـ fingerprint النهائي (هاش واحد
  // لكل الإشارات مجمّعة، محتفظ به فقط للتوافق الخلفي مع أي سيرفر قديم)
  // بقينا نبعت كل إشارة لوحدها مهشّرة (canvasHash, webglHash, ...) في
  // كائن "signals". السبب: جوه Telegram WebView كتير من الإشارات دي
  // (خصوصًا canvas/webgl/hardware) بتطلع متطابقة بين أجهزة مختلفة تمامًا
  // لمجرد إنها نفس موديل الموبايل/نفس نسخة التطبيق — فلو السيرفر بيقارن
  // الهاش الكلي المجمّع كـ "طابق = نفس الجهاز" هيحصل حظر جماعي غلط.
  // بإرسال كل إشارة لوحدها، السيرفر يقدر يدّي كل إشارة وزن مختلف
  // (deviceId المخزَّن محليًا أقوى بكتير من canvas/webgl مثلًا) ويحسب
  // درجة تشابه بدل قرار "نعم/لا" واحد. القرار النهائي والـ threshold
  // لسه بيتاخدوا في السيرفر — الملف ده بس بيوفّر البيانات المفصّلة.
  async function collect() {
    if (_cache) return _cache;
    if (_pending) return _pending;

    _pending = (async function () {
      var canvasRaw    = getCanvasFingerprint();
      var webglRaw     = getWebglFingerprint();
      var hardwareRaw  = getHardwareSignal();
      var fontsRaw     = getFontsSignal();
      var audioRaw     = await getAudioFingerprint();

      var canvasHash   = canvasRaw   ? await sha256Hex(canvasRaw)   : '';
      var webglHash    = webglRaw    ? await sha256Hex(webglRaw)    : '';
      var hardwareHash = hardwareRaw ? await sha256Hex(hardwareRaw) : '';
      var fontsHash    = fontsRaw    ? await sha256Hex(fontsRaw)    : '';
      // audio ممكن يرجع فاضي لو استعجل التايم-آوت (800ms) — بنميّز الحالة
      // دي صراحةً بدل ما نسيبها '' عادي، عشان السيرفر ميحسبهاش "تطابق"
      // بين جهازين لمجرد إن الاتنين مالحقوش يجيبوا قيمة الصوت.
      var audioHash    = audioRaw ? await sha256Hex(audioRaw) : 'unavailable';

      var rawSignature = [canvasRaw, webglRaw, hardwareRaw, fontsRaw, audioRaw].join('##');
      var fingerprint  = await sha256Hex(rawSignature); // للتوافق الخلفي فقط
      var deviceId     = await getOrCreateDeviceId();
      var suspiciousFlags = getSuspiciousFlags();

      _cache = {
        fingerprint: fingerprint, // deprecated: كان بيُستخدم كمطابقة كاملة/جزئية — استخدم signals بدل منه
        deviceId: deviceId,
        suspiciousFlags: suspiciousFlags,
        signals: {
          canvasHash: canvasHash,
          webglHash: webglHash,
          hardwareHash: hardwareHash,
          fontsHash: fontsHash,
          audioHash: audioHash
        }
      };
      return _cache;
    })();

    return _pending;
  }

  global.AntiFraud = { collect: collect };
})(window);
