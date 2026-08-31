/**
 * ========================================================================
 *  worker.js — Backend كامل لمشروع Telegram Mini App (SHIB Rewards)
 *  يعمل على Cloudflare Workers (ES Modules) — ملف واحد فقط
 *  قاعدة البيانات: Firebase Realtime Database عبر REST API
 * ========================================================================
 *
 *  Environment Variables (تُضاف من Cloudflare Dashboard > Settings > Variables):
 *
 *    FIREBASE_DATABASE_URL  -> *مطلوب دائمًا* (مثال: https://your-project.firebaseio.com)
 *                              لازم يكون موجود كـ Env Var لأن السيرفر يحتاجه فقط
 *                              للوصول لقاعدة البيانات قبل قراءة أي إعدادات منها.
 *
 *    BOT_TOKEN               -> توكن بوت التليجرام (Secret) — *احتياطي فقط*.
 *    BOT_USERNAME             -> يوزر البوت بدون @ — *احتياطي فقط*.
 *
 *  ملاحظة مهمة جدًا (تغيير عن النسخة السابقة):
 *    BOT_TOKEN و BOT_USERNAME أصبحا قابلين للتعديل مباشرة من Firebase تحت
 *    المسار config/botToken و config/botUsername. لو موجودين في Firebase
 *    هيتم استخدامهم، ولو غير موجودين هيتم استخدام Env Vars كقيمة احتياطية
 *    (Fallback) ثم تُحفظ في Firebase تلقائيًا كقيمة مبدئية يمكن تعديلها بعدها.
 *    وبالمثل كل قيم المكافآت والسحب والاشتراك الإجباري قابلة للتعديل من
 *    Firebase مباشرة تحت عقدة config/ — الكود فقط يضع قيم مبدئية لو الحقل
 *    غير موجود، ولا يلمس أي قيمة موجودة بالفعل (حتى لو غيّرنا القيم
 *    الافتراضية في كود جديد مستقبلًا).
 *
 *  ملاحظة أمان مهمة:
 *    لازم تضبط Rules بتاعة Firebase Realtime Database عشان القراءة/الكتابة
 *    تتم فقط من السيرفر (الـ Worker)، مينفعش تسيب الداتابيز Public للكل،
 *    خصوصًا الآن إن config/ ممكن يحتوي على BOT_TOKEN نفسه.
 *    أبسط حل: اجعل القواعد ".read": false / ".write": false من الـ Client.
 * ========================================================================
 */

// ──────────────────────────────────────────────────────────────────────
//  ثوابت عامة للنظام — كل القيم دي قابلة للتعديل من Firebase تحت config/
//  العملة المستخدمة في كل أنحاء البوت: PMT
//  (هذه القيم تُستخدم فقط كـ "قيمة مبدئية" أول مرة، ولا يتم الكتابة فوق
//   أي قيمة موجودة بالفعل في Firebase تم تعديلها يدويًا)
// ──────────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  botUsername: 'Pmt_Gram_Bot',
  referralReward: 4000,        // Daily referral reward after watching 10 ads
  referralPayoutDays: 3,       // عدد الأيام اللي تُدفع فيها مكافأة الإحالة (بدل 3 ثابتة)
  comboReward: 5000,           // مكافأة الكومبو اليومي (SHIBA)
  taskDefaultReward: 500,      // مكافأة افتراضية لمهام القنوات/البوتات
  dailyBonusReward: 500,       // المكافأة اليومية
  adReward: 200,               // قيمة احتياطية فقط (fallback) لو الشركة مش موجودة في adCompanies/
  adDailyLimit: 20,
  adCompanyDailyLimit: 10,     // قيمة احتياطية فقط (fallback)
  // إعدادات كل شركة إعلانات على حدة: المكافأة والحد اليومي المسموح لكل
  // شركة بشكل مستقل. تُقرأ من Firebase تحت config/adCompanies/<company>/
  // ولو الشركة غير موجودة، يتم استخدام adReward و adCompanyDailyLimit
  // كقيمة احتياطية أعلاه.
  adCompanies: {
    monetag: { reward: 200, dailyLimit: 10 },
    adsgram: { reward: 200, dailyLimit: 10 },
  },
  minWithdrawal: 50000,        // أقل مبلغ يمكن سحبه (SHIBA)
  tonConversionRate: 10000,    // 10,000 PMT = 1 TON
  depositWallet: 'UQAACNWWtTtN7ILkhRERwYUTzo06Bd1Tv_8Yk5gPioIMFoUD',
  withdrawalEnabled: true,     // تشغيل/إيقاف نظام السحب بالكامل
  mandatorySubEnabled: true,   // تشغيل/إيقاف الاشتراك الإجباري بالكامل
  miningReward: 50,
  miningDurationMs: 60 * 60 * 1000,
  gameDailyLimit: 3,           // عدد مرات لعب كل لعبة المسموح بها يوميًا لكل مستخدم
  pricePer100MembersTon: 0.15, // سعر كل 100 عضو مطلوب في "ترويج القناة" بعملة TON
  pricePer100MembersShiba: 200000,
  pricePer100MembersUsd: 1,
};

// عنوان محفظة الإيداع مأخوذ من نظام الإيداع العامل (server 58).
const DEPOSIT_RECEIVER_WALLET = 'UQAACNWWtTtN7ILkhRERwYUTzo06Bd1Tv_8Yk5gPioIMFoUD';

// ───────── مهام الدعوة (Invite) الثابتة — تُنشأ مرة واحدة فقط إذا لم تكن
// موجودة، وبعد ذلك تصبح قابلة للتعديل بالكامل من Firebase (لا يتم
// التعديل عليها تلقائيًا مرة أخرى حتى لو الكود تغيّر) ─────
const FIXED_INVITE_TASKS = [
  { id: 'invite_1',   title: 'دعوة 1 مستخدم',    requiredReferrals: 1,   reward: 1000 },
  { id: 'invite_10',  title: 'دعوة 10 مستخدمين', requiredReferrals: 10,  reward: 10000 },
  { id: 'invite_25',  title: 'دعوة 25 مستخدم',   requiredReferrals: 25,  reward: 25000 },
  { id: 'invite_50',  title: 'دعوة 50 مستخدم',   requiredReferrals: 50,  reward: 50000 },
  { id: 'invite_100', title: 'دعوة 100 مستخدم',  requiredReferrals: 100, reward: 100000 },
];

// ───────── قنوات الاشتراك الإجباري الافتراضية — تُنشأ مرة واحدة فقط لو
// عقدة mandatoryChannels/ غير موجودة بالمرة في Firebase. بعد ذلك يمكن
// إضافة/حذف/تعديل أي قناة مباشرة من Firebase تحت نفس المسار ─────
const DEFAULT_MANDATORY_CHANNELS = [
  { id: 'panda_mining_news', title: 'Panda Mining News', link: 'https://t.me/PandaMiningNews', username: 'PandaMiningNews', status: 'active' },
];

// مجموعة الإيموجيز المستخدمة في الكومبو اليومي
const COMBO_EMOJI_POOL = ['🦴', '🏠', '🎾', '🍖'];

// ───────── مهام "الانضمام لبوت" (category: bots) لا يمكن التحقق منها
// بشكل حقيقي عبر Telegram Bot API (مفيش getChatMember على بوت تاني)،
// فبدلاً من التحقق الحقيقي، نفرض فترة انتظار حقيقية بعد فتح رابط
// البوت (مُسجَّلة من السيرفر، وليست مجرد مؤقّت في الواجهة يمكن تجاوزه)
// قبل السماح للمستخدم بالضغط على Verify واستلام المكافأة ─────
const BOT_TASK_WAIT_SECONDS = 3;

// ───────── عجلة الحظ (Lucky Wheel) — 8 قطاعات بالترتيب المعروض في الواجهة،
// كل قطاع له "وزن" (weight) يحدد احتمالية الفوز به (الأوزان الأكبر = احتمال
// أعلى). المجموع = 1000 لتسهيل حساب النسبة المئوية ─────
const WHEEL_SEGMENTS = [
  { reward: 100,   weight: 250 }, // 25%
  { reward: 500,   weight: 180 }, // 18%
  { reward: 0,     weight: 100 }, // 10%
  { reward: 1000,  weight: 140 }, // 14%
  { reward: 250,   weight: 200 }, // 20%
  { reward: 2000,  weight: 80  }, //  8%
  { reward: 5000,  weight: 40  }, //  4%
  { reward: 10000, weight: 10  }, //  1%
];
const WHEEL_REFERRALS_PER_SPIN = 2; // كل عدد إحالات نشطة (Active) دي = لفة واحدة مجانية

// ───────── مهمة "Promote Your Channel" — تسعير ترويج القناة بالمقابل لعدد
// الأعضاء الجدد المطلوبين: كل 100 عضو = 200,000 شيبا (≈ 1 دولار) ─────
const PRICE_PER_100_MEMBERS_SHIBA = 200000;
const PRICE_PER_100_MEMBERS_USD = 1;

// مدة صلاحية initData (بالثواني) لحماية Replay — هنا 24 ساعة
const INIT_DATA_MAX_AGE = 24 * 60 * 60;

// إعدادات الـ Rate Limiting البسيط (تخزين في الذاكرة الخاصة بالـ Isolate)
const RATE_LIMIT_WINDOW_MS = 10 * 1000; // نافذة 10 ثواني
const RATE_LIMIT_MAX_REQ = 20;          // أقصى عدد طلبات في النافذة

const rateLimitStore = new Map();      // key -> [timestamps]
const usedInitDataHashes = new Map();  // hash -> expireAt (replay protection)

// ════════════════════════════════════════════════════════════════════
//  نظام الحماية ضد الاحتيال — Anti-Fraud System (10 طبقات)
// ════════════════════════════════════════════════════════════════════
const AF_FRAUD_SCORE_BLOCK       = 70;
const AF_FRAUD_SCORE_WARN        = 40;
const AF_MAX_ACCOUNTS_PER_DEVICE = 5;

const AF_WEIGHTS = {
  fingerprintReused:   35,
  deviceIdReused:      30,
  rapidAccountCreate:  20,
  headlessBrowser:     25,
  emulatorDetected:    20,
  devToolsOpen:        10,
  sameIpManyAccounts:  15,
  fingerprintMissing:   5,
};

function afSanitiseKey(str, maxLen = 64) {
  if (typeof str !== 'string') return null;
  const clean = str.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, maxLen);
  return clean.length >= 8 ? clean : null;
}

function afCalcScore(flags) {
  let score = 0;
  for (const [flag, active] of Object.entries(flags)) {
    if (active && AF_WEIGHTS[flag]) score += AF_WEIGHTS[flag];
  }
  return Math.min(score, 100);
}

function afBuildReason(flags) {
  const parts = [];
  if (flags.fingerprintReused)  parts.push('نفس بصمة الجهاز');
  if (flags.deviceIdReused)     parts.push('نفس معرف الجهاز');
  if (flags.rapidAccountCreate) parts.push('إنشاء حسابات متعددة بسرعة');
  if (flags.headlessBrowser)    parts.push('متصفح headless');
  if (flags.emulatorDetected)   parts.push('emulator مشتبه');
  if (flags.sameIpManyAccounts) parts.push('عدة حسابات من نفس الشبكة');
  return parts.length ? parts.join(' | ') : 'نشاط مشبوه';
}

async function checkAntiFraud(env, request, telegramId, body) {
  const tid  = String(telegramId);
  const ip   = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua   = request.headers.get('User-Agent')       || '';
  const rawFP  = body._deviceFingerprint || null;
  const rawDID = body._deviceId          || null;
  const suspFlags = body._suspiciousFlags || {};
  const fp  = afSanitiseKey(rawFP,  64);
  const did = afSanitiseKey(rawDID, 64);

  // هل الحساب محظور مسبقاً؟
  try {
    const accountBlocked = await dbGet(env, `blocked_accounts/${tid}`);
    if (accountBlocked) {
      return { blocked: false, referralBlocked: true, reason: 'الحساب ممنوع من مكافآت الإحالة' };
    }
  } catch (_) {}

  const flags = {
    fingerprintMissing:   !fp,
    headlessBrowser:      !!suspFlags.headless,
    emulatorDetected:     !!suspFlags.emulator,
    devToolsOpen:         !!suspFlags.devtools,
    fingerprintReused:    false,
    deviceIdReused:       false,
    rapidAccountCreate:   false,
    sameIpManyAccounts:   false,
  };

  let firstOwner = null;
  const nowMs = Date.now();

  // ── فحص الـ Fingerprint ──────────────────────────────────────────
  if (fp) {
    try {
      const deviceRecord = await dbGet(env, `devices/${fp}`);
      if (!deviceRecord) {
        await dbSet(env, `devices/${fp}`, {
          firstSeenAt: nowMs, firstTelegramId: tid,
          fingerprint: fp, deviceId: did || '', ip, ua, count: 1,
        });
      } else {
        firstOwner = String(deviceRecord.firstTelegramId);
        // ملاحظة: لا يتم تفعيل fingerprintReused هنا مباشرة، القرار
        // بيتم بناءً على عدد الحسابات الفعلي على الجهاز (AF_MAX_ACCOUNTS_PER_DEVICE) تحت.
        await dbUpdate(env, `devices/${fp}`, {
          count: (deviceRecord.count || 1) + 1, lastSeen: nowMs, lastIp: ip,
        });
      }

      // رابط جهاز ↔ حساب
      const linkPath = `device_links/${fp}/${tid}`;
      const existingLink = await dbGet(env, linkPath);
      // عدد الحسابات الحالي على هذا الجهاز (قبل إضافة الحساب الجديد)
      const allLinksBefore = await dbGet(env, `device_links/${fp}`);
      const countBefore = allLinksBefore ? Object.keys(allLinksBefore).length : 0;

      if (!existingLink) {
        // لو عدد الحسابات الحالي فعلاً وصل أو تعدى الحد المسموح، الحساب الجديد يُحظر
        if (countBefore >= AF_MAX_ACCOUNTS_PER_DEVICE) {
          flags.fingerprintReused = true;
        }
        await dbSet(env, linkPath, {
          telegramId: tid, seenAt: nowMs, ip, deviceId: did || '',
          rewarded: !flags.fingerprintReused,
        });
      }
    } catch (_) {}
  }

  // ── فحص الـ Device ID ────────────────────────────────────────────
  if (did) {
    try {
      const didPath = `device_id_map/${did}`;
      const didRecord = await dbGet(env, didPath);
      if (!didRecord) {
        await dbSet(env, didPath, { firstTelegramId: tid, seenAt: nowMs, tids: [tid] });
      } else {
        const didOwner = String(didRecord.firstTelegramId);
        const didTids  = Array.isArray(didRecord.tids) ? didRecord.tids.slice() : [didOwner];
        if (!didTids.includes(tid)) {
          if (didTids.length >= AF_MAX_ACCOUNTS_PER_DEVICE) {
            flags.deviceIdReused = true;
            if (!firstOwner) firstOwner = didOwner;
          } else {
            didTids.push(tid);
            await dbUpdate(env, didPath, { tids: didTids });
          }
        }
      }
    } catch (_) {}
  }

  // ── فحص سرعة إنشاء الحسابات عبر IP ──────────────────────────────
  try {
    const ipKey  = `ip_counters/${ip.replace(/\./g, '_').replace(/:/g, '-').replace(/[^a-zA-Z0-9_\-]/g, '')}`;
    const ipData = await dbGet(env, ipKey);
    const oneHour = 60 * 60 * 1000;

    if (!ipData) {
      await dbSet(env, ipKey, { count: 1, firstSeen: nowMs, tids: [tid] });
    } else {
      const tids = (ipData.tids || []).filter(Boolean);
      if (!tids.includes(tid)) {
        tids.push(tid);
        const freshCount = ipData.firstSeen && (nowMs - ipData.firstSeen) < oneHour ? tids.length : 1;
        if (freshCount > 3) flags.sameIpManyAccounts = true;
        if (freshCount > 5) flags.rapidAccountCreate  = true;
        await dbUpdate(env, ipKey, { count: freshCount, tids: tids.slice(-20), lastSeen: nowMs });
      }
    }
  } catch (_) {}

  // ── حساب الدرجة وتسجيل الأحداث ──────────────────────────────────
  const score = afCalcScore(flags);

  if (score >= AF_FRAUD_SCORE_WARN) {
    try {
      await dbPush(env, 'fraud_logs', {
        telegramId: tid, fingerprint: fp || 'missing', deviceId: did || 'missing',
        ip, ts: nowMs, reason: afBuildReason(flags), score, flags,
      });
    } catch (_) {}
  }

  if (score >= AF_FRAUD_SCORE_BLOCK || flags.fingerprintReused || flags.deviceIdReused) {
    try {
      await dbUpdate(env, `blocked_accounts/${tid}`, {
        reason: afBuildReason(flags), score, ts: nowMs,
        firstOwner: firstOwner || 'unknown',
      });
    } catch (_) {}
    return { blocked: false, referralBlocked: true, reason: afBuildReason(flags), score };
  }

  return { blocked: false, referralBlocked: false, score };
}

async function isReferralEligible(env, newUserTelegramId) {
  try {
    const tid = String(newUserTelegramId);
    const blocked = await dbGet(env, `blocked_accounts/${tid}`);
    if (blocked) return { eligible: false, reason: blocked.reason || 'جهاز محظور' };
  } catch (_) {}
  return { eligible: true };
}
// ════════════════════════════════════════════════════════════════════
//  نهاية نظام الحماية ضد الاحتيال
// ════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────
//  CORS Headers
// ──────────────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data, X-Action',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  });
}

function ok(data) {
  return json({ success: true, data, serverTime: Date.now() });
}

function fail(error, status = 400) {
  return json({ success: false, error, serverTime: Date.now() }, status);
}

// ──────────────────────────────────────────────────────────────────────
//  أدوات مساعدة عامة
// ──────────────────────────────────────────────────────────────────────
function bufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateReferralCode(telegramId) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${String(telegramId).slice(-4)}${rand}`.slice(0, 10);
}

function todayKeyUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────────────────────────
//  Rate Limiting بسيط بالذاكرة (بحسب IP)
// ──────────────────────────────────────────────────────────────────────
function checkRateLimit(key) {
  const now = Date.now();
  const arr = (rateLimitStore.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX_REQ) {
    rateLimitStore.set(key, arr);
    return false;
  }
  arr.push(now);
  rateLimitStore.set(key, arr);
  return true;
}

function cleanupExpiredHashes() {
  const now = Date.now();
  for (const [hash, exp] of usedInitDataHashes) {
    if (exp < now) usedInitDataHashes.delete(hash);
  }
}

// ──────────────────────────────────────────────────────────────────────
//  التحقق من Telegram WebApp initData (HMAC-SHA256)
// ──────────────────────────────────────────────────────────────────────
async function verifyTelegramInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string' || initData.length < 10) {
    return { valid: false, error: 'initData مفقود أو غير صالح' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { valid: false, error: 'لا يوجد hash في initData' };

  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || nowSec - authDate > INIT_DATA_MAX_AGE) {
    return { valid: false, error: 'initData منتهي الصلاحية (Replay Protection)' };
  }

  try {
    const enc = new TextEncoder();

    const webAppDataKey = await crypto.subtle.importKey(
      'raw',
      enc.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const secretKeyBuffer = await crypto.subtle.sign('HMAC', webAppDataKey, enc.encode(botToken));

    const secretKey = await crypto.subtle.importKey(
      'raw',
      secretKeyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const computedHashBuffer = await crypto.subtle.sign('HMAC', secretKey, enc.encode(dataCheckString));
    const computedHash = bufferToHex(computedHashBuffer);

    if (computedHash !== hash) {
      return { valid: false, error: 'توقيع initData غير صحيح (تأكد من أن BOT_TOKEN صحيح)' };
    }

    cleanupExpiredHashes();
    usedInitDataHashes.set(hash, Date.now() + INIT_DATA_MAX_AGE * 1000);

    const userJson = params.get('user');
    const user = userJson ? JSON.parse(userJson) : null;
    if (!user || !user.id) {
      return { valid: false, error: 'لا يوجد بيانات مستخدم في initData' };
    }

    // ───── start_param: القيمة دي بتتولّد فقط لو رابط الدعوة كان بصيغة
    // ?startapp=CODE (رابط مباشر لميني أب) — مش ?start=CODE (دي بصيغة
    // بوت تقليدي بترسل رسالة /start للشات ومش بتدخل initData بالمرة) ─────
    return {
      valid: true,
      user,
      startParam: params.get('start_param') || null,
      authDate,
    };
  } catch (err) {
    return { valid: false, error: 'فشل التحقق من initData: ' + err.message };
  }
}

// ──────────────────────────────────────────────────────────────────────
//  Firebase Realtime Database — REST API Helpers
// ──────────────────────────────────────────────────────────────────────
function dbUrl(env, path) {
  const base = env.FIREBASE_DATABASE_URL.replace(/\/$/, '');
  return `${base}/${path}.json`;
}

async function dbGet(env, path) {
  const res = await fetch(dbUrl(env, path));
  if (!res.ok) throw new Error(`Firebase GET فشل (${res.status}) على ${path}`);
  return await res.json();
}

async function dbSet(env, path, value) {
  const res = await fetch(dbUrl(env, path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Firebase PUT فشل (${res.status}) على ${path}`);
  return await res.json();
}

async function dbUpdate(env, path, value) {
  const res = await fetch(dbUrl(env, path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Firebase PATCH فشل (${res.status}) على ${path}`);
  return await res.json();
}

async function dbPush(env, path, value) {
  const res = await fetch(dbUrl(env, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Firebase POST فشل (${res.status}) على ${path}`);
  const j = await res.json();
  return j.name;
}

async function dbDelete(env, path) {
  const res = await fetch(dbUrl(env, path), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Firebase DELETE فشل (${res.status}) على ${path}`);
}

// ──────────────────────────────────────────────────────────────────────
//  الإعدادات العامة للمشروع (config/) — كل القيم قابلة للتعديل من Firebase
// ──────────────────────────────────────────────────────────────────────
async function getConfig(env) {
  let config = await dbGet(env, 'config');
  if (!config) config = {};

  let changed = false;
  for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
    if (config[k] === undefined) {
      config[k] = v;
      changed = true;
    }
  }
  // اسم البوت ثابت هنا حتى لا تستمر روابط الإحالة في استخدام اسم قديم
  // محفوظ في Firebase أو في متغيرات البيئة.
  if (config.botUsername !== DEFAULT_CONFIG.botUsername) {
    config.botUsername = DEFAULT_CONFIG.botUsername;
    changed = true;
  }
  if (env.BOT_TOKEN && config.botToken !== env.BOT_TOKEN) {
    config.botToken = env.BOT_TOKEN;
    changed = true;
  } else if (config.botToken === undefined) {
    config.botToken = env.BOT_TOKEN || '';
    changed = true;
  }

  if (changed) {
    try {
      await dbSet(env, 'config', config);
    } catch (_) {
      // لو فشل الحفظ، نكمل بالقيم محليًا لهذا الطلب بس بدون ما نوقف السيرفر
    }
  }

  return config;
}

// تثبيت مهام الدعوة الثابتة *فقط لو غير موجودة* — لا يتم لمس أي مهمة
// موجودة بالفعل حتى لو قيمها مختلفة عن القيم الافتراضية في الكود
// (بهذا الشكل تقدر تعدّل reward/title/status لأي مهمة دعوة من Firebase
// وتتأكد إنها هتفضل بنفس القيمة ومش هترجع تتصفّر تلقائيًا)
async function ensureFixedInviteTasks(env) {
  const existing = await dbGet(env, 'tasks');
  const updates = {};
  for (const t of FIXED_INVITE_TASKS) {
    const already = existing && existing[t.id];
    if (!already) {
      updates[t.id] = {
        id: t.id,
        title: t.title,
        link: '',
        reward: t.reward,
        category: 'invite',
        status: 'active',
        requiredReferrals: t.requiredReferrals,
      };
    }
  }
  if (Object.keys(updates).length) {
    await dbUpdate(env, 'tasks', updates);
  }
}

// قنوات الاشتراك الإجباري — تُنشأ بقيمة مبدئية مرة واحدة فقط لو العقدة
// غير موجودة بالمرة في Firebase. لو صاحب المشروع مسح كل القنوات يدويًا
// (عقدة فاضية {}) مش هيتم زرع القناة الافتراضية تاني.
async function getMandatoryChannels(env) {
  let raw = await dbGet(env, 'mandatoryChannels');
  if (raw === null || raw === undefined) {
    const seed = {};
    for (const c of DEFAULT_MANDATORY_CHANNELS) {
      seed[c.id] = { title: c.title, link: c.link, username: c.username, status: c.status };
    }
    await dbSet(env, 'mandatoryChannels', seed);
    raw = seed;
  }
  return Object.entries(raw)
    .map(([id, c]) => ({ id, ...c }))
    .filter((c) => c.status !== 'disabled' && c.status !== 'inactive');
}

// ──────────────────────────────────────────────────────────────────────
//  المنطق الخاص بالمستخدمين
// ──────────────────────────────────────────────────────────────────────
async function getOrCreateUser(env, tgUser, startParam, config, botToken) {
  const telegramId = String(tgUser.id);
  let user = await dbGet(env, `users/${telegramId}`);

  if (!user) {
    const referralCode = generateReferralCode(telegramId);
    user = {
      telegramId,
      firstName: tgUser.first_name || '',
      lastName: tgUser.last_name || '',
      username: tgUser.username || '',
      photoUrl: tgUser.photo_url || '',
      languageCode: tgUser.language_code || '',
       balance: 0,
       tonBalance: 0,
      wallet: '',
      referralCode,
      referredBy: null,
      completedTasks: [],
      comboClaimDate: null,
      totalAdsWatched: 0,
      wheelSpinsUsed: 0,
      forceSubPassed: false,
      createdAt: Date.now(),
      lastLogin: Date.now(),
    };

    await dbSet(env, `users/${telegramId}`, user);

    // تسجيل الإحالة بعد حفظ المستخدم، حتى يمكن إعادة المحاولة أيضًا
    // إذا كان المستخدم قد فتح التطبيق سابقًا بدون رابط دعوة.
    await registerReferralIfNeeded(env, user, startParam, config);

    // لو الاشتراك الإجباري متوقف أو لا توجد قنوات مفعّلة، فعّل الإحالة فورًا
    const fsStatus = await checkUserForceSub(env, telegramId, botToken, config);
    if (fsStatus.passed) {
      await dbUpdate(env, `users/${telegramId}`, { forceSubPassed: true });
      user.forceSubPassed = true;
      await activateReferralIfNeeded(env, telegramId, config, botToken);
    }
  } else {
    user.firstName = tgUser.first_name || user.firstName;
    user.lastName = tgUser.last_name || user.lastName;
    user.username = tgUser.username || user.username;
    user.photoUrl = tgUser.photo_url || user.photoUrl;
    user.languageCode = tgUser.language_code || user.languageCode;
    user.lastLogin = Date.now();
    await dbUpdate(env, `users/${telegramId}`, {
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      photoUrl: user.photoUrl,
      languageCode: user.languageCode,
      lastLogin: user.lastLogin,
    });
    await registerReferralIfNeeded(env, user, startParam, config);
  }

  // دعم حالة المستخدم الموجود مسبقًا: لو استوفى الشروط بالفعل،
  // فعّل الإحالة الجديدة فور تسجيلها.
  if (user.forceSubPassed) {
    await activateReferralIfNeeded(env, user.telegramId, config, botToken);
  }

  return user;
}

async function registerReferralIfNeeded(env, user, startParam, config) {
  const telegramId = String(user.telegramId);

  // ───── تسجيل تشخيصي (Debug): بيسجّل كل مرة يوصل فيها start_param
  // للسيرفر بغض النظر عن نجاح أو فشل الربط، عشان تقدر تتابع في
  // Firebase تحت debug_referral_attempts/<telegramId> هل الكود
  // وصل من الأساس، وهل لقى المُحيل ولا لأ، من غير ما تحتاج تفحص
  // الكود أو تسأل المستخدم أسئلة كتير كل مرة.
  const logAttempt = async (extra) => {
    try {
      await dbSet(env, `debug_referral_attempts/${telegramId}`, {
        startParamReceived: startParam || null,
        alreadyHadReferrer: !!user.referredBy,
        ts: Date.now(),
        ...extra,
      });
    } catch (_) {}
  };

  if (!startParam) {
    await logAttempt({ result: 'no_start_param' });
    return;
  }
  if (user.referredBy) {
    await logAttempt({ result: 'already_has_referrer', existingReferrer: user.referredBy });
    return;
  }

  try {
    const referralCode = String(startParam).trim().slice(0, 128);
    if (!referralCode) {
      await logAttempt({ result: 'empty_code_after_trim' });
      return;
    }

    const referrer = await findUserByReferralCode(env, referralCode);
    if (!referrer) {
      await logAttempt({ result: 'referrer_not_found', codeSearched: referralCode });
      return;
    }
    if (String(referrer.telegramId) === telegramId) {
      await logAttempt({ result: 'self_referral_blocked', codeSearched: referralCode });
      return;
    }

    const referrerId = String(referrer.telegramId);
    const existingRef = await dbGet(env, `referrals/${referrerId}/${telegramId}`);
    if (!existingRef) {
      const reward = config.referralReward ?? DEFAULT_CONFIG.referralReward;
      const payoutDays = getReferralPayoutDays(config);
      // تُسجّل الإحالة pending وتتحول إلى active بعد استيفاء شروط التفعيل.
      await dbSet(env, `referrals/${referrerId}/${telegramId}`, {
        telegramId,
        firstName: user.firstName,
        username: user.username,
        photoUrl: user.photoUrl,
        joinedAt: Date.now(),
        reward,
        status: 'pending',
      });
      await sendTelegramMessage(env, config.botToken || '', referrerId,
        `👥 New referral joined!\n\n👤 ${user.firstName || user.username || 'A user'} opened Pmt Gram with your link.\n\n⏳ They need to watch 10 ads before you get paid.\n💎 Your reward: +${Number(reward).toLocaleString('en-US')} PMT each day for ${payoutDays} day${payoutDays === 1 ? '' : 's'}`);
    }

    user.referredBy = referrerId;
    await dbUpdate(env, `users/${telegramId}`, { referredBy: referrerId });
    await logAttempt({ result: 'linked_ok', referrerId, codeSearched: referralCode });
  } catch (err) {
    // فشل تسجيل الإحالة لا يمنع المستخدم من فتح التطبيق.
    await logAttempt({ result: 'exception', errorMessage: String(err && err.message || err) });
  }
}

async function findUserByReferralCode(env, code) {
  const base = env.FIREBASE_DATABASE_URL.replace(/\/$/, '');
  const url = `${base}/users.json?orderBy=${encodeURIComponent('"referralCode"')}&equalTo=${encodeURIComponent('"' + code + '"')}`;
  const res = await fetch(url);
  if (res.ok) {
    const result = await res.json();
    if (result) {
      const key = Object.keys(result)[0];
      if (key) return result[key];
    }
  }

  // Fallback لو Firebase Rules أو الفهرس منعوا الاستعلام المفلتر.
  // عدد المستخدمين عادة محدود، والبحث هنا يتم من السيرفر فقط.
  try {
    const allUsers = await dbGet(env, 'users');
    if (!allUsers) return null;
    const wanted = String(code).trim().toUpperCase();
    const match = Object.values(allUsers).find((u) =>
      String(u?.referralCode || '').trim().toUpperCase() === wanted
    );
    return match || null;
  } catch (_) {
    return null;
  }
}

// ───────── إعدادات كل شركة إعلانات على حدة ─────────
// تُقرأ من Firebase تحت config/adCompanies/<company>/{reward, dailyLimit}
// ولو مش موجودة، بترجع للقيم الاحتياطية config/adReward و config/adCompanyDailyLimit.
function getAdCompanyConfig(config, company) {
  const perCompany = (config.adCompanies && config.adCompanies[company]) || {};
  const reward = Number(
    perCompany.reward ?? config.adReward ?? DEFAULT_CONFIG.adReward
  );
  const dailyLimit = Number(
    perCompany.dailyLimit ?? config.adCompanyDailyLimit ?? DEFAULT_CONFIG.adCompanyDailyLimit
  );
  return { reward, dailyLimit };
}

// يرجّع إعدادات كل الشركات المعروفة (مفيد لعرضها في الواجهة/لوحة التحكم)
function getAllAdCompaniesConfig(config) {
  const known = new Set([
    ...Object.keys(DEFAULT_CONFIG.adCompanies || {}),
    ...Object.keys(config.adCompanies || {}),
  ]);
  const result = {};
  for (const company of known) {
    result[company] = getAdCompanyConfig(config, company);
  }
  return result;
}

async function incrementBalance(env, telegramId, amount) {
  const user = await dbGet(env, `users/${telegramId}`);
  const newBalance = (user?.balance || 0) + amount;
  await dbUpdate(env, `users/${telegramId}`, { balance: newBalance });
  return newBalance;
}

async function chargeTonBalance(env, telegramId, amount) {
  const user = await dbGet(env, `users/${telegramId}`);
  const balance = Number(user?.tonBalance || 0);
  const charge = Number(amount);
  if (!Number.isFinite(charge) || charge <= 0) {
    return { ok: false, error: 'Invalid TON task price' };
  }
  if (balance < charge) {
    return { ok: false, error: `Insufficient TON balance. You need ${charge.toFixed(4)} TON.` };
  }
  const newBalance = Number((balance - charge).toFixed(4));
  await dbUpdate(env, `users/${telegramId}`, { tonBalance: newBalance });
  await addBalanceLog(env, telegramId, {
    type: 'task_promotion_payment',
    amount: -charge,
    currency: 'TON',
    ts: Date.now(),
  });
  return { ok: true, tonBalance: newBalance };
}

async function addBalanceLog(env, telegramId, logEntry) {
  await dbPush(env, `balanceLogs/${telegramId}`, logEntry);

  // عمولة المحيل 10% من أرباح المستخدم المُحال.
  if (Number(logEntry.amount || 0) > 0 &&
       logEntry.type !== 'referral_reward' &&
       logEntry.type !== 'referral_daily_reward' &&
      logEntry.type !== 'referral_commission') {
    try {
      const referredUser = await dbGet(env, `users/${telegramId}`);
      const referrerId = referredUser?.referredBy;
      const referral = referrerId
        ? await dbGet(env, `referrals/${referrerId}/${telegramId}`)
        : null;
      const blocked = await dbGet(env, `blocked_accounts/${telegramId}`);
      const commission = Math.floor(Number(logEntry.amount) * 0.10);
      if (referrerId && referral?.status === 'active' &&
          Number(referredUser?.totalAdsWatched || 0) >= 10 &&
          !blocked && commission > 0) {
        await incrementBalance(env, referrerId, commission);
        await dbPush(env, `balanceLogs/${referrerId}`, {
          type: 'referral_commission',
          amount: commission,
          relatedUser: String(telegramId),
          sourceType: logEntry.type || 'earning',
          ts: Date.now(),
        });
      }
    } catch (_) {
      // لا نوقف ربح المستخدم إذا تعذر تسجيل العمولة.
    }
  }
}

// تفعيل مكافأة الإحالة للداعي (يُستدعى بعد نجاح المُحال في الاشتراك
// الإجباري — أو فورًا عند إنشاء الحساب لو الاشتراك الإجباري متوقف).
// ملحوظة مهمة: حتى لو الشرط ده اتحقق، المكافأة (والحالة "active" في
// القايمة) متترصدش إلا بعد ما المُحال يشوف 10 إعلانات فعليًا
// (totalAdsWatched >= 10). ده مش باج — ده إجراء مقصود ضد الاحتيال.
// لو حابب تغيّر العدد أو تلغي الشرط، عدّل الرقم 10 هنا وفي
// handleGetState (سطر فيه adsRequired: 10).
async function sendTelegramMessage(env, botToken, chatId, text) {
  if (!botToken || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(chatId), text }),
    });
  } catch (_) {}
}

function cairoDayNumber(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1) / 86400000;
}

// عدد الأيام اللي بتتدفع فيها مكافأة الإحالة (افتراضيًا 3 أيام) - قابل
// للتعديل بالكامل من Firebase تحت config/referralPayoutDays
function getReferralPayoutDays(config) {
  const n = Math.floor(Number(config?.referralPayoutDays ?? DEFAULT_CONFIG.referralPayoutDays));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CONFIG.referralPayoutDays;
}

function referralDayIndex(joinedAt, today, payoutDays = 3) {
  const joined = todayKeyCairoFromTimestamp(joinedAt || Date.now());
  return Math.min(payoutDays, Math.max(1, cairoDayNumber(today) - cairoDayNumber(joined) + 1));
}

function referralDays(refRecord, referredUser, today, payoutDays = 3) {
  const saved = refRecord?.dailyRewards || {};
  const currentDay = referralDayIndex(refRecord?.joinedAt, today, payoutDays);
  const adsToday = referredUser?.adWatchDate === today
    ? Number(referredUser?.adsWatchedToday || 0) : 0;
  const days = [];
  for (let day = 1; day <= payoutDays; day++) days.push(day);
  return days.map((day) => ({
    day,
    adsWatched: saved[`day${day}`]?.adsWatched || (day === currentDay ? adsToday : 0),
    adsRequired: 10,
    claimed: !!saved[`day${day}`]?.claimed,
    reward: Number(saved[`day${day}`]?.reward || 0),
  }));
}

// مكافأة الإحالة اليومية: 10 إعلانات في كل يوم، لمدة 3 أيام.
async function activateReferralIfNeeded(env, telegramId, config, botToken) {
  const logActivation = async (extra) => {
    try {
      await dbSet(env, `debug_referral_activation/${telegramId}`, {
        ts: Date.now(),
        ...extra,
      });
    } catch (_) {}
  };

  const user = await dbGet(env, `users/${telegramId}`);
  if (!user || !user.referredBy) {
    await logActivation({ result: 'no_user_or_no_referrer' });
    return;
  }
  const referrerId = user.referredBy;
  const refRecord = await dbGet(env, `referrals/${referrerId}/${telegramId}`);
  if (!refRecord) {
    await logActivation({ result: 'no_referral_record_found', referrerId });
    return;
  }

  const today = todayKeyCairo();
  const payoutDays = getReferralPayoutDays(config);
  const day = referralDayIndex(refRecord.joinedAt, today, payoutDays);
  const dailyRewards = { ...(refRecord.dailyRewards || {}) };
  // ترحيل الإحالات القديمة التي حصلت على المكافأة القديمة مرة واحدة:
  // نعتبر المكافأة القديمة هي Day 1 حتى لا تُدفع مرتين.
  if (!refRecord.dailyRewards && refRecord.status === 'active') {
    dailyRewards.day1 = { claimed: true, adsWatched: 10, reward: Number(refRecord.reward || 0), legacy: true };
  }
  const watched = user.adWatchDate === today ? Number(user.adsWatchedToday || 0) : 0;
  if (watched < 10 || dailyRewards[`day${day}`]?.claimed) return;

  // ── فحص أهلية مكافأة الإحالة (Anti-Fraud) ──────────────────────
  const refEligibility = await isReferralEligible(env, telegramId);
  if (!refEligibility.eligible) {
    // سجّل الرفض ثم توقف — الحساب يعمل لكن بدون مكافأة
    try {
      await dbPush(env, 'fraud_logs', {
        type: 'referral_blocked', telegramId, referrerId,
        reason: refEligibility.reason, ts: Date.now(),
      });
    } catch (_) {}
    await logActivation({ result: 'blocked_anti_fraud', referrerId, reason: refEligibility.reason });
    return;
  }
  // ─────────────────────────────────────────────────────────────────
  const reward = Number(refRecord.reward ?? config.referralReward ?? DEFAULT_CONFIG.referralReward);
  dailyRewards[`day${day}`] = { claimed: true, adsWatched: watched, reward, date: today, claimedAt: Date.now() };
  const completed = [1, 2, 3].every((n) => dailyRewards[`day${n}`]?.claimed);
  await dbUpdate(env, `referrals/${referrerId}/${telegramId}`, {
    dailyRewards, status: completed ? 'completed' : 'active',
    activatedAt: refRecord.activatedAt || Date.now(), lastRewardAt: Date.now(),
  });
  const newBalance = await incrementBalance(env, referrerId, reward);
  await addBalanceLog(env, referrerId, {
    type: 'referral_daily_reward',
    amount: reward,
    relatedUser: telegramId,
    day,
    ts: Date.now(),
  });
  const referralName = user.firstName || user.username || 'Your referral';
  const activationMessage = day === 1
    ? `🎉 Referral activated!\n\n👤 ${referralName} watched 10 ads and is now active.\n\n💎 +${reward.toLocaleString('en-US')} PMT credited 💰 Balance: ${Number(newBalance || 0).toLocaleString('en-US')} PMT\n\n📈 You also earn 10% of everything they make, forever.`
    : `🎉 Referral day ${day} completed!\n\n👤 ${referralName} watched 10 ads.\n\n💎 +${reward.toLocaleString('en-US')} PMT credited 💰 Balance: ${Number(newBalance || 0).toLocaleString('en-US')} PMT\n\n📈 You also earn 10% of everything they make, forever.`;
  await sendTelegramMessage(env, botToken, referrerId, activationMessage);
  await logActivation({ result: 'daily_reward_credited', referrerId, day, reward });
}

// ──────────────────────────────────────────────────────────────────────
//  نظام الكومبو اليومي (Daily Combo)
// ──────────────────────────────────────────────────────────────────────
function simpleHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

async function getOrCreateTodayCombo(env, config) {
  const dateKey = todayKeyUTC();
  let combo = await dbGet(env, `combo/${dateKey}`);
  if (combo) return combo;

  const seed = simpleHash(dateKey + (config.botToken || 'seed'));
  const rand = seededRandom(seed);
  const pool = [...COMBO_EMOJI_POOL];
  const correct = [];
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(rand() * pool.length);
    correct.push(pool.splice(idx, 1)[0]);
  }

  combo = {
    date: dateKey,
    items: correct,
    reward: config.comboReward ?? DEFAULT_CONFIG.comboReward,
    createdAt: Date.now(),
  };
  await dbSet(env, `combo/${dateKey}`, combo);
  return combo;
}

// ──────────────────────────────────────────────────────────────────────
//  عجلة الحظ (Lucky Wheel)
// ──────────────────────────────────────────────────────────────────────

// اختيار قطاع عشوائي من عجلة الحظ بحسب الأوزان (weight) المحددة لكل قطاع
function pickWheelSegmentIndex() {
  const total = WHEEL_SEGMENTS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    r -= WHEEL_SEGMENTS[i].weight;
    if (r <= 0) return i;
  }
  return WHEEL_SEGMENTS.length - 1;
}

// عدد اللفات المتاحة حاليًا = (عدد الإحالات النشطة ÷ 2) − عدد اللفات
// المستخدمة من قبل. لا يمكن أن يكون سالبًا.
function computeSpinsAvailable(activeReferralsCount, spinsUsed) {
  const earned = Math.floor((activeReferralsCount || 0) / WHEEL_REFERRALS_PER_SPIN);
  return Math.max(0, earned - (spinsUsed || 0));
}

// ──────────────────────────────────────────────────────────────────────
//  نظام التحقق من المهام / الاشتراك الإجباري عبر Telegram Bot API
// ──────────────────────────────────────────────────────────────────────
function extractChatIdentifier(link) {
  if (!link) return null;
  const match = link.match(/t\.me\/([A-Za-z0-9_]+)/);
  return match ? `@${match[1]}` : null;
}

async function checkTelegramMembership(env, chatLink, telegramId, botToken) {
  const chatId = extractChatIdentifier(chatLink);
  if (!chatId || !botToken) return false;

  const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${telegramId}`;
  try {
    const res = await fetch(url);
    const result = await res.json();
    if (!result.ok || !result.result?.user) return false;
    if (String(result.result.user.id) !== String(telegramId)) return false;
    const member = result.result;
    const status = member.status;
    // "restricted" is valid only when Telegram says the user is still a member.
    return ['member', 'administrator', 'creator'].includes(status) ||
      (status === 'restricted' && member.is_member === true);
  } catch (_) {
    return false;
  }
}

async function checkBotAdminInChat(chatLink, botToken) {
  const chatId = extractChatIdentifier(chatLink);
  if (!chatId || !botToken) {
    return { ok: false, error: 'Use a public Telegram channel link such as https://t.me/yourchannel.' };
  }
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const me = await meRes.json();
    if (!me.ok || !me.result?.id) {
      return { ok: false, error: 'Unable to verify the bot account.' };
    }
    const memberRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${me.result.id}`
    );
    const member = await memberRes.json();
    const status = member.ok ? member.result?.status : null;
    if (['administrator', 'creator'].includes(status)) {
      return { ok: true, status };
    }
    return {
      ok: false,
      error: 'Please add the bot as an administrator in your channel, then try again.',
    };
  } catch (_) {
    return { ok: false, error: 'Unable to verify the bot permissions in this channel.' };
  }
}

// التحقق الحقيقي (Live) من انضمام المستخدم لكل قنوات الاشتراك الإجباري
// عبر Telegram Bot API (getChatMember) — وليس مجرد ادعاء من الواجهة
async function checkUserForceSub(env, telegramId, botToken, config) {
  const enabled = config.mandatorySubEnabled !== false;
  const channels = enabled ? await getMandatoryChannels(env) : [];

  if (!enabled || channels.length === 0) {
    return { required: false, passed: true, channels: [] };
  }

  const results = [];
  let allJoined = true;
  for (const ch of channels) {
    const joined = await checkTelegramMembership(env, ch.link, telegramId, botToken);
    if (!joined) allJoined = false;
    results.push({
      id: ch.id,
      title: ch.title || ch.username || extractChatIdentifier(ch.link) || ch.link,
      link: ch.link,
      joined,
    });
  }
  return { required: true, passed: allJoined, channels: results };
}

// ──────────────────────────────────────────────────────────────────────
//  Input Validation Helpers
// ──────────────────────────────────────────────────────────────────────
function isNonEmptyString(v, maxLen = 500) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

function isValidUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// تحقق من شكل عنوان محفظة BEP-20 (شبكة BNB Smart Chain هي الشبكة التي
// تعمل عليها عملة SHIBA المستخدمة في هذا البوت للسحب) — صيغة Ethereum-style:
// 0x ثم 40 حرف Hexadecimal (42 حرف بالكامل)
function isValidBep20Address(addr) {
  if (typeof addr !== 'string') return false;
  const v = addr.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(v);
}

// ════════════════════════════════════════════════════════════════════
//  معالجات الـ API (Route Handlers)
// ════════════════════════════════════════════════════════════════════

// ───────────────────────── POST /getState ─────────────────────────
async function handleGetState(env, ctx) {
  const { user, config, botToken } = ctx;
  const telegramId = user.telegramId;

  const [tasksRaw, completedRaw, referralsRaw, logsRaw, withdrawalsRaw, gamePlaysRaw] = await Promise.all([
    dbGet(env, 'tasks'),
    dbGet(env, `users/${telegramId}/completedTasks`),
    dbGet(env, `referrals/${telegramId}`),
    dbGet(env, `balanceLogs/${telegramId}`),
    dbGet(env, `withdrawals/${telegramId}`),
    dbGet(env, `gamePlays/${telegramId}/${todayKeyCairo()}`),
  ]);

  // ───── إعادة التحقق الفعلي (Live) من الاشتراك الإجباري في كل مرة يفتح
  // فيها المستخدم الويب أب — وليس فقط أول مرة. لو ترك القنوات بعد أن كان
  // قد اشترك سابقًا، يُعاد قفل الواجهة حتى يرجع ويشترك من جديد ─────
  const fsStatus = await checkUserForceSub(env, telegramId, botToken, config);
  if (fsStatus.passed !== !!user.forceSubPassed) {
    await dbUpdate(env, `users/${telegramId}`, { forceSubPassed: fsStatus.passed });
    user.forceSubPassed = fsStatus.passed;
  }
  if (fsStatus.passed) {
    await activateReferralIfNeeded(env, telegramId, config, botToken);
  }

  const tasks = tasksRaw
    ? Object.entries(tasksRaw).map(([id, t]) => ({ id, ...t })).filter((t) => t.status === 'active' && t.category !== 'invite')
    : [];

  const completedTasks = completedRaw ? Object.keys(completedRaw) : [];

  // status غير موجودة (سجلات قديمة من قبل هذا التحديث) = تُعتبر "active"
  // تلقائيًا لأنها كانت بالفعل اكتسبت مكافأتها تحت المنطق القديم
  const referrals = referralsRaw
    ? await Promise.all(Object.entries(referralsRaw).map(async ([id, r]) => {
        const [referredUser, blocked, referredLogs] = await Promise.all([
          dbGet(env, `users/${id}`).catch(() => null),
          dbGet(env, `blocked_accounts/${id}`).catch(() => null),
          dbGet(env, `balanceLogs/${id}`).catch(() => null),
        ]);
        const adsWatched = Number(referredUser?.totalAdsWatched || 0);
        const logs = referredLogs ? Object.values(referredLogs) : [];
        const totalEarned = logs
          .filter((l) => Number(l.amount || 0) > 0 && l.type !== 'referral_commission')
          .reduce((sum, l) => sum + Number(l.amount || 0), 0);
        const referrerEarned = logsRaw
          ? Object.values(logsRaw)
              .filter((l) => l.type === 'referral_commission' && String(l.relatedUser) === String(id))
              .reduce((sum, l) => sum + Number(l.amount || 0), 0)
          : 0;
        // Count only referral rewards for completed days, never the referred
        // user's own earnings. This keeps the card total accurate:
        // 1 completed day = daily reward + earned commission.
        const savedDailyRewards = r.dailyRewards || {};
        const referralRewardEarned = Object.keys(savedDailyRewards).length
          ? Object.values(savedDailyRewards)
              .filter((day) => day && day.claimed)
              .reduce((sum, day) => sum + Number(day.reward || r.reward || 0), 0)
          : (r.status === 'active' ? Number(r.reward || 0) : 0);
        const fraudMultipleAccounts = !!blocked;
        const days = referralDays(r, referredUser, todayKeyCairo(), getReferralPayoutDays(config));
        const completedDays = days.filter((d) => d.claimed).length;
        return {
          id,
          ...r,
          firstName: referredUser?.firstName || r.firstName || '',
          lastName: referredUser?.lastName || '',
          username: referredUser?.username || r.username || '',
          photoUrl: referredUser?.photoUrl || r.photoUrl || '',
          status: completedDays >= 3 ? 'completed' : completedDays > 0 ? 'active' : 'pending',
          adsWatched,
          adsRequired: 10,
          adsRemaining: Math.max(0, 10 - adsWatched),
          days,
          completedDays,
          totalEarned,
          referrerEarned,
          referralRewardEarned,
          totalReferralEarned: referralRewardEarned + referrerEarned,
          fraudMultipleAccounts,
          fraudReason: blocked?.reason || '',
        };
      }))
    : [];

  const balanceLogs = logsRaw
    ? Object.entries(logsRaw).map(([id, l]) => ({ id, ...l })).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30)
    : [];

  const today = todayKeyCairo();
  const allLogsForStats = logsRaw
    ? Object.values(logsRaw)
    : [];
  const todayLogs = allLogsForStats.filter((l) => {
    if (l.date === today) return true;
    return l.ts && todayKeyCairoFromTimestamp(l.ts) === today;
  });
  const dailyBonusClaimed = user.dailyBonusDate === today;
  const adsByCompany = user.adWatchDate === today
    ? { ...(user.adsWatchedByCompany || {}) }
    : {};
  if (user.adWatchDate === today && !Object.keys(adsByCompany).length && user.adsWatchedToday) {
    adsByCompany.monetag = Number(user.adsWatchedToday || 0);
  }
  const adsWatchedToday = Object.values(adsByCompany)
    .reduce((sum, count) => sum + Number(count || 0), 0);
  const adCompaniesConfig = getAllAdCompaniesConfig(config);
  const adCompanyDailyLimit = Number(config.adCompanyDailyLimit ?? DEFAULT_CONFIG.adCompanyDailyLimit);
  const earnedToday = todayLogs
    .filter((l) => (parseFloat(l.amount) || 0) > 0)
    .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

  const withdrawals = withdrawalsRaw
    ? Object.entries(withdrawalsRaw).map(([id, w]) => ({ id, ...w })).sort((a, b) => (b.ts || 0) - (a.ts || 0))
    : [];

  // لا نرسل botToken للواجهة الأمامية أبدًا — بيانات حساسة سيرفر فقط
  const clientConfig = { ...config };
  delete clientConfig.botToken;

   const activeReferralsCount = referrals.filter((r) => (r.status === 'active' || r.status === 'completed')).length;
  const wheelSpinsUsed = user.wheelSpinsUsed || 0;
  const wheelSpinsAvailable = computeSpinsAvailable(activeReferralsCount, wheelSpinsUsed);

  return ok({
    user: { ...user, completedTasks },
    balance: user.balance || 0,
    tasks,
    completedTasks,
    referrals,
    balanceLogs,
    withdrawals,
    config: clientConfig,
    mining: {
      startedAt: Number(user.miningStartedAt || 0) || null,
      reward: Number(config.miningReward ?? DEFAULT_CONFIG.miningReward),
      durationMs: Number(config.miningDurationMs ?? DEFAULT_CONFIG.miningDurationMs),
    },
    tonBalance: Number(user.tonBalance || 0),
    wheel: {
      segments: WHEEL_SEGMENTS.map((s) => s.reward),
      spinsAvailable: wheelSpinsAvailable,
      spinsUsed: wheelSpinsUsed,
      referralsPerSpin: WHEEL_REFERRALS_PER_SPIN,
    },
    daily: {
      reward: config.dailyBonusReward ?? DEFAULT_CONFIG.dailyBonusReward,
      claimed: dailyBonusClaimed,
    },
    stats: {
      adsWatchedToday,
      adsWatchedByCompany: adsByCompany,
      adCompanies: adCompaniesConfig,   // { monetag: {reward, dailyLimit}, adsgram: {...}, ... } لكل شركة
      adCompanyDailyLimit,
      adDailyTotalLimit: Number(config.adDailyLimit ?? DEFAULT_CONFIG.adDailyLimit),
      friendsInvited: referrals.length,
      earnedToday,
    },
    gamePlays: gamePlaysRaw || {},
    referralStats: {
      total: referrals.length,
      active: activeReferralsCount,
     inactive: referrals.filter((r) => r.status !== 'active' && r.status !== 'completed' && !r.fraudMultipleAccounts).length,
      multipleAccounts: referrals.filter((r) => r.fraudMultipleAccounts).length,
      commissionEarned: referrals.reduce((sum, r) => sum + Number(r.referrerEarned || 0), 0),
    },
    forceSub: {
      required: fsStatus.required,
      passed: fsStatus.passed,
      channels: fsStatus.channels.map((c) => ({
        id: c.id,
        title: c.title,
        link: c.link,
      })),
    },
  });
}

function todayKeyUTCFromTimestamp(ts) {
  const d = new Date(Number(ts));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function todayKeyCairo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function todayKeyCairoFromTimestamp(ts) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Number(ts)));
}

// ───────────────────────── POST /claimDailyBonus ───────────────────────
async function handleClaimDailyBonus(env, ctx) {
  const { user, config } = ctx;
  const telegramId = user.telegramId;
  const dateKey = todayKeyCairo();
  const freshUser = await dbGet(env, `users/${telegramId}`);
  if (freshUser?.dailyBonusDate === dateKey) {
    return fail('لقد استلمت المكافأة اليومية بالفعل');
  }
  const reward = Number(config.dailyBonusReward ?? DEFAULT_CONFIG.dailyBonusReward);
  const newBalance = await incrementBalance(env, telegramId, reward);
  await dbUpdate(env, `users/${telegramId}`, { dailyBonusDate: dateKey });
  await addBalanceLog(env, telegramId, { type: 'daily_bonus', amount: reward, date: dateKey, ts: Date.now() });
  return ok({ shibaBalance: newBalance, shibaAdded: reward, date: dateKey });
}

// أكواد الاستبدال تُدار من Firebase تحت redeemCodes/{CODE}.
// مثال: { reward: 2500, active: true, maxUses: 100, usedCount: 0, expiresAt: 0 }
async function handleRedeemCode(env, ctx) {
  const { user, body } = ctx;
  const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
  if (!code) return fail('أدخل كود صحيح');
  const codePath = `redeemCodes/${code}`;
  const record = await dbGet(env, codePath);
  if (!record || record.active === false) return fail('الكود غير موجود أو غير متاح');
  if (record.expiresAt && Date.now() > Number(record.expiresAt)) return fail('انتهت صلاحية هذا الكود');
  const maxUses = Number(record.maxUses || 0);
  if (maxUses > 0 && Number(record.usedCount || 0) >= maxUses) return fail('تم استخدام الكود بالكامل');
  const userUsePath = `redeemCodeUses/${user.telegramId}/${code}`;
  if (await dbGet(env, userUsePath)) return fail('لقد استخدمت هذا الكود من قبل');
  const reward = Math.floor(Number(record.reward));
  if (!Number.isFinite(reward) || reward <= 0) return fail('قيمة الكود غير صالحة');
  const newBalance = await incrementBalance(env, user.telegramId, reward);
  await dbSet(env, userUsePath, { reward, redeemedAt: Date.now() });
  await dbUpdate(env, codePath, { usedCount: Number(record.usedCount || 0) + 1 });
  await addBalanceLog(env, user.telegramId, { type: 'redeem_code', amount: reward, code, ts: Date.now() });
  return ok({ shibaBalance: newBalance, shibaAdded: reward });
}

async function handleClaimAdReward(env, ctx) {
  const { user, config, body } = ctx;
  const today = todayKeyCairo();
  const freshUser = await dbGet(env, `users/${user.telegramId}`);
  const company = body.company === 'adsgram' ? 'adsgram' : 'monetag';
  const companyConfig = getAdCompanyConfig(config, company);
  const limit = companyConfig.dailyLimit;
  const byCompany = freshUser?.adWatchDate === today
    ? { ...(freshUser.adsWatchedByCompany || {}) }
    : {};
  if (freshUser?.adWatchDate === today && !Object.keys(byCompany).length && freshUser.adsWatchedToday) {
    byCompany.monetag = Number(freshUser.adsWatchedToday || 0);
  }
  const watched = Number(byCompany[company] || 0);
  if (watched >= limit) return fail('You have reached the daily ad limit for this company');
  const totalWatchedToday = Object.values(byCompany).reduce((sum, count) => sum + Number(count || 0), 0);
  const overallDailyLimit = Number(config.adDailyLimit ?? DEFAULT_CONFIG.adDailyLimit);
  if (overallDailyLimit > 0 && totalWatchedToday >= overallDailyLimit) {
    return fail('You have reached your overall daily ad limit');
  }
  const reward = Math.floor(companyConfig.reward);
  if (!Number.isFinite(reward) || reward <= 0) return fail('Invalid ad reward');
  const newBalance = await incrementBalance(env, user.telegramId, reward);
  byCompany[company] = watched + 1;
  await dbUpdate(env, `users/${user.telegramId}`, {
    adWatchDate: today,
    adsWatchedByCompany: byCompany,
    adsWatchedToday: Object.values(byCompany).reduce((sum, count) => sum + Number(count || 0), 0),
    totalAdsWatched: Number(freshUser?.totalAdsWatched || 0) + 1,
  });
  await addBalanceLog(env, user.telegramId, { type: 'ad_reward', amount: reward, date: today, ts: Date.now() });
  if (watched + 1 >= 10) {
    await activateReferralIfNeeded(env, user.telegramId, config);
  }
  return ok({
    shibaBalance: newBalance,
    shibaAdded: reward,
    company,
    adsWatchedToday: Object.values(byCompany).reduce((sum, count) => sum + Number(count || 0), 0),
    adsWatchedByCompany: byCompany,
    adCompanyDailyLimit: limit,
    adDailyTotalLimit: Number(config.adDailyLimit ?? DEFAULT_CONFIG.adDailyLimit),
  });
}

// ───────────────────────── Mining session ─────────────────────────
// مشاهدة إعلان Monetag تفتح جلسة تعدين واحدة. الرصيد لا يُحتسب من
// الواجهة: السيرفر يحسبه من وقت البداية، ولا يسمح بالمطالبة قبل ساعة.
async function handleStartMining(env, ctx) {
  const { user, config } = ctx;
  const path = `users/${user.telegramId}`;
  const freshUser = await dbGet(env, path);
  if (freshUser?.miningStartedAt) return fail('Mining is already in progress');
  const startedAt = Date.now();
  const miningReward = Number(config.miningReward ?? DEFAULT_CONFIG.miningReward);
  const miningDurationMs = Number(config.miningDurationMs ?? DEFAULT_CONFIG.miningDurationMs);
  await dbUpdate(env, path, { miningStartedAt: startedAt });
  return ok({
    startedAt,
    miningStartedAt: startedAt,
    miningReward,
    miningDurationMs,
  });
}

async function handleClaimMining(env, ctx) {
  const { user, config } = ctx;
  const path = `users/${user.telegramId}`;
  const freshUser = await dbGet(env, path);
  const startedAt = Number(freshUser?.miningStartedAt || 0);
  if (!startedAt) return fail('No mining session found. Watch the ad first');
  const durationMs = Number(config.miningDurationMs ?? DEFAULT_CONFIG.miningDurationMs);
  if (Date.now() - startedAt < durationMs) return fail('Mining is not complete yet');
  const miningReward = Number(config.miningReward ?? DEFAULT_CONFIG.miningReward);
  const newBalance = await incrementBalance(env, user.telegramId, miningReward);
  await dbUpdate(env, path, { miningStartedAt: null, miningLastClaimedAt: Date.now() });
  await addBalanceLog(env, user.telegramId, { type: 'mining_reward', amount: miningReward, ts: Date.now() });
  return ok({ shibaBalance: newBalance, shibaAdded: miningReward, miningStartedAt: null });
}

// ───────────────────────── POST /playGame ─────────────────────────────
// لكل لعبة 3 محاولات يوميًا، مع فرض حدود المكافآت من السيرفر.
async function handlePlayGame(env, ctx) {
  const { user, body, config } = ctx;
  const telegramId = user.telegramId;
  const game = String(body.game || '');
  const maxRewards = { gem: 100, wheel: 81, xo: 20, fruit: 100 };
  const allowed = Object.keys(maxRewards);
  if (!allowed.includes(game)) return fail('اللعبة غير صالحة');

  const dailyLimit = Number(config.gameDailyLimit ?? DEFAULT_CONFIG.gameDailyLimit);
  const dateKey = todayKeyCairo();
  const path = `gamePlays/${telegramId}/${dateKey}/${game}`;
  const used = Number(await dbGet(env, path) || 0);
  if (used >= dailyLimit) return fail(`لقد استخدمت المحاولات المتاحة (${dailyLimit}) لهذه اللعبة اليوم`);

  const submittedScore = Math.floor(Number(body.score || 0));
  const score = Math.max(0, Math.min(maxRewards[game], Number.isFinite(submittedScore) ? submittedScore : 0));
  const reward = score;
  await dbSet(env, path, used + 1);

  let newBalance = user.balance || 0;
  if (reward > 0) newBalance = await incrementBalance(env, telegramId, reward);
  await addBalanceLog(env, telegramId, { type: 'game_reward', game, amount: reward, ts: Date.now() });
  const gamePlays = (await dbGet(env, `gamePlays/${telegramId}/${dateKey}`)) || {};
  return ok({ game, shibaBalance: newBalance, shibaAdded: reward, gamePlays });
}

// ───────────────────────── POST /checkForceSub ─────────────────────────
// تحقق فعلي (Live) عبر Telegram API من انضمام المستخدم لقنوات الاشتراك
// الإجباري. لو نجح لأول مرة، يتم تفعيل مكافأة الإحالة لو كان مُحالاً.
async function handleCheckForceSub(env, ctx) {
  const { user, config, botToken } = ctx;
  const status = await checkUserForceSub(env, user.telegramId, botToken, config);

  if (status.passed && !user.forceSubPassed) {
    await dbUpdate(env, `users/${user.telegramId}`, { forceSubPassed: true });
    await activateReferralIfNeeded(env, user.telegramId, config);
  }

  return ok(status);
}

// ───────────────────────── POST /startTask ─────────────────────────
// يُستدعى من الواجهة لحظة ضغط المستخدم على "Join" وفتح رابط المهمة.
// بيسجّل وقت البدء في السيرفر (وليس في المتصفح) عشان نقدر نفرض فترة
// الانتظار الحقيقية (52 ثانية) على مهام "الانضمام لبوت" بدون إمكانية
// التحايل عليها من الواجهة الأمامية ─────
async function handleStartTask(env, ctx) {
  const { user, body } = ctx;
  const telegramId = user.telegramId;
  const taskId = body.taskId;

  if (!isNonEmptyString(taskId, 100)) {
    return fail('taskId غير صالح');
  }

  const task = await dbGet(env, `tasks/${taskId}`);
  if (!task || task.status !== 'active' || task.category === 'invite') {
    return fail('المهمة غير موجودة أو غير مفعّلة');
  }

  const alreadyDone = await dbGet(env, `completedTasks/${telegramId}/${taskId}`);
  if (alreadyDone) {
    return fail('تم استلام مكافأة هذه المهمة من قبل');
  }

  // لا نستبدل وقت بدء سابق لو موجود (عشان حد ما يقدر يعيد تعيين العداد
  // بالضغط على "Join" تاني وتاني)
  const existing = await dbGet(env, `taskStarts/${telegramId}/${taskId}`);
  if (!existing) {
    await dbSet(env, `taskStarts/${telegramId}/${taskId}`, Date.now());
  }

  return ok({ taskId, waitSeconds: task.category === 'bots' ? BOT_TASK_WAIT_SECONDS : 0 });
}

// ───────────────────────── POST /verifyTask ─────────────────────────
async function handleVerifyTask(env, ctx) {
  const { user, body, config, botToken } = ctx;
  const telegramId = user.telegramId;
  const taskId = body.taskId;

  if (!isNonEmptyString(taskId, 100)) {
    return fail('taskId غير صالح');
  }

  const task = await dbGet(env, `tasks/${taskId}`);
  if (!task || task.status !== 'active') {
    return fail('المهمة غير موجودة أو غير مفعّلة');
  }

  if (task.category === 'invite') {
    return fail('هذا النوع من المهام يتم استلامه عبر /claimTask');
  }

  const alreadyDone = await dbGet(env, `completedTasks/${telegramId}/${taskId}`);
  if (alreadyDone) {
    return fail('تم استلام مكافأة هذه المهمة من قبل');
  }

  if (task.category === 'bots') {
     // Bot tasks cannot be verified through Telegram Bot API. The server
     // records the link-open time and enforces a three-second wait.
    const startedAt = await dbGet(env, `taskStarts/${telegramId}/${taskId}`);
    if (!startedAt) {
       return fail('Open the bot link first by pressing Join');
    }
    const elapsedMs = Date.now() - startedAt;
    const requiredMs = BOT_TASK_WAIT_SECONDS * 1000;
    if (elapsedMs < requiredMs) {
      const remaining = Math.ceil((requiredMs - elapsedMs) / 1000);
       return fail(`Wait ${remaining} seconds after opening the bot, then press Verify`);
    }
  } else {
     // Channel tasks use a real live membership check through Telegram Bot API.
    const isMember = await checkTelegramMembership(env, task.link, telegramId, botToken);
    if (!isMember) {
       return fail('You have not joined this channel. Join it first, then try again');
    }
  }

  const reward = task.reward ?? config.taskDefaultReward ?? DEFAULT_CONFIG.taskDefaultReward;
  const newBalance = await incrementBalance(env, telegramId, reward);

  await dbSet(env, `completedTasks/${telegramId}/${taskId}`, { completedAt: Date.now(), reward });
  await dbUpdate(env, `users/${telegramId}/completedTasks`, { [taskId]: true });
  await dbDelete(env, `taskStarts/${telegramId}/${taskId}`).catch(() => {});
  await addBalanceLog(env, telegramId, {
    type: 'task_reward',
    taskId,
    amount: reward,
    ts: Date.now(),
  });

  // ── عدّاد إكمالات المهمة + الحذف التلقائي عند الوصول للهدف ───────
  // مهام ترويج القناة (channels/bots) بتُنشأ بعدد أعضاء مستهدف
  // (membersNeeded). كل مرة مستخدم يكمّل المهمة نزوّد العداد، ولو
  // العداد وصل للهدف تتحذف المهمة تلقائيًا من قائمة المهام النشطة.
  try {
    const newCompletions = (Number(task.completions) || 0) + 1;
    const target = Number(task.membersNeeded) || 0;
    if (target > 0 && newCompletions >= target) {
      await dbDelete(env, `tasks/${taskId}`);
    } else {
      await dbUpdate(env, `tasks/${taskId}`, { completions: newCompletions });
    }
  } catch (_) {}

  return ok({ shibaBalance: newBalance, shibaAdded: reward, taskId });
}

// ───────────────────────── POST /claimTask ─────────────────────────
// استلام مكافآت مهام الدعوة (Invite Friends) — يتم العدّ بالإحالات
// "النشطة" فقط (status === 'active'، أي عدّت الاشتراك الإجباري بنجاح)
async function handleClaimTask(env, ctx) {
  const { user, body, config } = ctx;
  const telegramId = user.telegramId;
  const taskId = body.taskId;

  if (!isNonEmptyString(taskId, 100)) {
    return fail('taskId غير صالح');
  }

  const task = await dbGet(env, `tasks/${taskId}`);
  if (!task || task.status !== 'active' || task.category !== 'invite') {
    return fail('مهمة الدعوة غير موجودة أو غير صالحة');
  }

  const alreadyDone = await dbGet(env, `completedTasks/${telegramId}/${taskId}`);
  if (alreadyDone) {
    return fail('تم استلام مكافأة هذه المهمة من قبل');
  }

  const referralsRaw = await dbGet(env, `referrals/${telegramId}`);
  const referralsList = referralsRaw ? Object.values(referralsRaw) : [];
  const referralsCount = referralsList.filter((r) => (r.status || 'active') === 'active').length;
  const required = task.requiredReferrals || task.requiredCount || 0;

  if (referralsCount < required) {
    return fail(`تحتاج إلى ${required} إحالات نشطة على الأقل (لديك ${referralsCount})`);
  }

  const reward = task.reward ?? config.taskDefaultReward ?? DEFAULT_CONFIG.taskDefaultReward;
  const newBalance = await incrementBalance(env, telegramId, reward);

  await dbSet(env, `completedTasks/${telegramId}/${taskId}`, { completedAt: Date.now(), reward });
  await dbUpdate(env, `users/${telegramId}/completedTasks`, { [taskId]: true });
  await addBalanceLog(env, telegramId, {
    type: 'claim_task',
    taskId,
    amount: reward,
    ts: Date.now(),
  });

  return ok({ shibaBalance: newBalance, shibaAdded: reward, taskId });
}

// ───────────────────── POST /submitTaskSuggestion ─────────────────────
// طلب ترويج قناة (Promote Your Channel): صاحب القناة يحدد رابط القناة وعدد
// الأعضاء الجدد المطلوبين، ويتم حساب السعر تلقائيًا (200,000 شيبا / 100 عضو
// ≈ 1 دولار). الطلب يُحفظ بحالة "pending" ليتواصل الفريق مع صاحب القناة
// بتفاصيل الدفع قبل تفعيل المهمة على صفحة Tasks لكل المستخدمين.
async function handleSubmitTaskSuggestion(env, ctx) {
  const { user, body, config } = ctx;
  const name = String(body.name || '').trim();
  const link = body.link;
  const category = body.category === 'bots' ? 'bots' : 'channels';
  const membersNeeded = Math.floor(parseFloat(body.membersNeeded));
  const desc = body.desc || '';

  if (!isNonEmptyString(name, 120)) {
    return fail('اسم المهمة غير صالح');
  }
  if (!isNonEmptyString(link, 300) || !isValidUrl(link)) {
    return fail('رابط القناة غير صالح');
  }
  if (!Number.isFinite(membersNeeded) || membersNeeded < 100) {
    return fail('عدد الأعضاء المطلوب غير صالح (الحد الأدنى 100 عضو)');
  }
  if (typeof desc !== 'string' || desc.length > 1000) {
    return fail('الملاحظات الإضافية طويلة جدًا');
  }

  const units = Math.ceil(membersNeeded / 100);
  const pricePer100Ton = Number(config.pricePer100MembersTon ?? DEFAULT_CONFIG.pricePer100MembersTon);
  const pricePer100Shiba = Number(config.pricePer100MembersShiba ?? DEFAULT_CONFIG.pricePer100MembersShiba);
  const pricePer100Usd = Number(config.pricePer100MembersUsd ?? DEFAULT_CONFIG.pricePer100MembersUsd);
  const priceShiba = units * pricePer100Shiba;
  const priceUsd = units * pricePer100Usd;
  const priceTon = Number((units * pricePer100Ton).toFixed(4));
  if (category === 'channels') {
    const botCheck = await checkBotAdminInChat(link, config.botToken);
    if (!botCheck.ok) return fail(botCheck.error);
  }
  const payment = await chargeTonBalance(env, user.telegramId, priceTon);
  if (!payment.ok) return fail(payment.error);

  // The bot task is accepted immediately. A channel task is accepted
  // immediately only after the bot-admin check above succeeds.
  {
    const taskId = `user_${category}_${user.telegramId}_${Date.now()}`;
    await dbSet(env, `tasks/${taskId}`, {
      id: taskId,
      title: name,
      link,
      category,
      ownerTelegramId: user.telegramId,
      reward: Number(config.taskDefaultReward ?? DEFAULT_CONFIG.taskDefaultReward),
       status: 'active',
      paymentCurrency: 'TON',
      paymentAmountTon: priceTon,
      membersNeeded,
       createdAt: Date.now(),
    });
    return ok({
      taskId,
      priceTon,
      tonBalance: payment.tonBalance,
      acceptedInstantly: true,
      botAdminVerified: category === 'channels',
    });
  }
}

// ───────────────────────── POST /spinWheel ─────────────────────────
// تنفيذ لفة عجلة الحظ: يتم حساب عدد اللفات المتاحة من الإحالات النشطة
// الحقيقية في قاعدة البيانات (مش من بيانات initData القديمة) لمنع التلاعب،
// ثم اختيار قطاع عشوائي بحسب الأوزان وإضافة المكافأة (لو > 0) للرصيد.
async function handleSpinWheel(env, ctx) {
  const { user } = ctx;
  const telegramId = user.telegramId;

  const referralsRaw = await dbGet(env, `referrals/${telegramId}`);
  const referralsList = referralsRaw ? Object.values(referralsRaw) : [];
  const activeReferralsCount = referralsList.filter((r) => (r.status || 'active') === 'active').length;

  const freshUser = await dbGet(env, `users/${telegramId}`);
  const spinsUsed = freshUser?.wheelSpinsUsed || 0;
  const spinsAvailable = computeSpinsAvailable(activeReferralsCount, spinsUsed);

  if (spinsAvailable <= 0) {
    return fail(`لا توجد لفات متاحة. تحتاج إلى دعوة ${WHEEL_REFERRALS_PER_SPIN} أصدقاء نشطين لكل لفة جديدة`);
  }

  const segmentIndex = pickWheelSegmentIndex();
  const reward = WHEEL_SEGMENTS[segmentIndex].reward;
  const newSpinsUsed = spinsUsed + 1;

  let newBalance = freshUser?.balance || 0;
  if (reward > 0) {
    newBalance = await incrementBalance(env, telegramId, reward);
  }
  await dbUpdate(env, `users/${telegramId}`, { wheelSpinsUsed: newSpinsUsed });

  if (reward > 0) {
    await addBalanceLog(env, telegramId, {
      type: 'wheel_spin',
      amount: reward,
      ts: Date.now(),
    });
  }

  return ok({
    segmentIndex,
    reward,
    shibaBalance: newBalance,
    spinsAvailable: computeSpinsAvailable(activeReferralsCount, newSpinsUsed),
    spinsUsed: newSpinsUsed,
  });
}

// ───────────────────────── POST /checkCombo ─────────────────────────
async function handleCheckCombo(env, ctx) {
  const { user, body, config } = ctx;
  const telegramId = user.telegramId;
  const selection = body.selection;

  if (!Array.isArray(selection) || selection.length !== 4) {
    return fail('يجب اختيار 4 عناصر بالضبط');
  }
  if (!selection.every((s) => typeof s === 'string' && s.length <= 8)) {
    return fail('عناصر الاختيار غير صالحة');
  }

  const dateKey = todayKeyUTC();

  if (user.comboClaimDate === dateKey) {
    return fail('لقد استلمت مكافأة الكومبو اليوم بالفعل');
  }

  const combo = await getOrCreateTodayCombo(env, config);
  const isCorrect = JSON.stringify(selection) === JSON.stringify(combo.items);

  if (!isCorrect) {
    return ok({ correct: false });
  }

  const reward = combo.reward ?? config.comboReward ?? DEFAULT_CONFIG.comboReward;
  const newBalance = await incrementBalance(env, telegramId, reward);

  await dbUpdate(env, `users/${telegramId}`, { comboClaimDate: dateKey });

  await addBalanceLog(env, telegramId, {
    type: 'combo_claim',
    amount: reward,
    date: dateKey,
    ts: Date.now(),
  });

  return ok({ correct: true, shibaBalance: newBalance, shibaAdded: reward });
}

// ───────────────────────── POST /getReferrals ─────────────────────────
async function handleGetReferrals(env, ctx) {
  const { user } = ctx;
  const referralsRaw = await dbGet(env, `referrals/${user.telegramId}`);
  const referrals = referralsRaw
    ? Object.entries(referralsRaw).map(([id, r]) => ({ id, ...r, status: r.status || 'active' }))
    : [];

  return ok({
    referrals,
    total: referrals.length,
    active: referrals.filter((r) => r.status === 'active').length,
    referralCode: user.referralCode,
  });
}

// ───────────────────────── POST /requestWithdrawal ─────────────────────────
// طلب سحب عملات SHIBA إلى عنوان محفظة BEP-20 (شبكة BNB Smart Chain) الخاص
// بالمستخدم.
// المعالجة (تحويل العملة فعليًا) تتم يدويًا من صاحب المشروع، ثم يقوم
// بتحديث status السحب في Firebase (withdrawals/{telegramId}/{id}) من
// "pending" إلى "completed" أو "rejected".
// تنبيه: في حال الرفض، الرصيد لا يُرجع تلقائيًا — يجب إرجاعه يدويًا عبر
// تعديل users/{telegramId}/balance في Firebase إذا تقرر رفض الطلب.
async function handleRequestWithdrawal(env, ctx) {
  const { user, body, config } = ctx;
  const telegramId = user.telegramId;

  if (config.withdrawalEnabled === false) {
    return fail('السحب متوقف حاليًا، حاول مرة أخرى لاحقًا');
  }

  const walletAddress = String(body.walletAddress || '').trim();
  const amount = Number(parseFloat(body.amountTon));

  if (!/^([UE]Q)[A-Za-z0-9_-]{46}$/.test(walletAddress)) {
    return fail('Invalid TON wallet address. It must start with UQ or EQ.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail('المبلغ غير صالح');
  }

  // قراءة رصيد لحظي (مش الرصيد المخزّن في initData القديم) لمنع التلاعب
  const freshUser = await dbGet(env, `users/${telegramId}`);
  const balance = Number(freshUser?.tonBalance || 0);
  const today = todayKeyCairo();
  const adsByCompanyToday = freshUser?.adWatchDate === today
    ? { ...(freshUser.adsWatchedByCompany || {}) }
    : {};
  if (freshUser?.adWatchDate === today && !Object.keys(adsByCompanyToday).length && freshUser.adsWatchedToday) {
    adsByCompanyToday.monetag = Number(freshUser.adsWatchedToday || 0);
  }
  const watchedAds = Object.values(adsByCompanyToday).reduce((sum, count) => sum + Number(count || 0), 0);
  const previousWithdrawals = await dbGet(env, `withdrawals/${telegramId}`);
  const withdrawalCount = previousWithdrawals ? Object.keys(previousWithdrawals).length : 0;
  const withdrawalRules = [
    { min: 0.1, ads: 15 },
    { min: 0.2, ads: 20 },
    { min: 0.3, ads: 25 },
  ];
  const rule = withdrawalRules[Math.min(withdrawalCount, 2)];
  if (watchedAds < rule.ads) {
    return fail(`You must watch ${rule.ads} ads before withdrawal ${withdrawalCount + 1}.`);
  }
  if (amount < rule.min) {
    return fail(`Minimum withdrawal ${withdrawalCount + 1} is ${rule.min} TON.`);
  }
  if (amount > balance) {
    return fail('Insufficient TON balance.');
  }

  const feeRate = 0.05;
  const fee = Number((amount * feeRate).toFixed(4));
  const netAmount = Number((amount - fee).toFixed(4));
  const newBalance = balance - amount;
  // تصفير عداد الإعلانات المستخدم في شرط السحب: العداد أصلاً بيتصفر يوميًا
  // (لأنه مربوط بـ adWatchDate)، وبعد التعديل ده بيتصفر كمان فورًا بعد أي
  // عملية سحب ناجحة، عشان المستخدم يحتاج يشاهد إعلانات جديدة قبل السحب التالي
  // حتى لو لسه في نفس اليوم.
  await dbUpdate(env, `users/${telegramId}`, {
    tonBalance: newBalance,
    tonWallet: walletAddress,
    adWatchDate: today,
    adsWatchedByCompany: {},
    adsWatchedToday: 0,
  });

  const withdrawalId = await dbPush(env, `withdrawals/${telegramId}`, {
    walletAddress,
    amount: netAmount,
    requestedAmount: amount,
    fee,
    feeRate,
    netAmount,
    currency: 'TON',
    withdrawalNumber: withdrawalCount + 1,
    adsRequired: rule.ads,
    status: 'pending',
    ts: Date.now(),
    // نخزّن لقطة من بيانات المستخدم وقت طلب السحب (اسم/يوزر/صورة) عشان
    // تُستخدم لاحقًا في صفحة "Record" العامة اللي بتعرض كل السحوبات
    // المكتملة، من غير ما نحتاج نقرأ users/ لكل مستخدم في كل مرة.
    firstName: user.firstName || '',
    username: user.username || '',
    photoUrl: user.photoUrl || '',
  });

  await addBalanceLog(env, telegramId, {
    type: 'withdrawal',
    amount: -amount,
    currency: 'TON',
    status: 'pending',
    withdrawalId,
    ts: Date.now(),
  });

  return ok({
    tonBalance: newBalance,
    withdrawalId,
    requestedAmount: amount,
    fee,
    netAmount,
    adsWatchedToday: 0,
    adsWatchedByCompany: {},
  });
}

// ───────────────────────── POST /createDeposit ───────────────────────
// يسجل BOC المرسل من TonConnect كإيداع معلّق. لا يتم إضافة الرصيد
// قبل التحقق من المعاملة عبر TonCenter.
async function handleCreateDeposit(env, ctx) {
  const { user, body } = ctx;
  const amount = Number(body.amount);
  const txHash = String(body.txHash || '').trim();
  if (!Number.isFinite(amount) || amount <= 0 || !txHash) {
    return fail('بيانات الإيداع غير مكتملة');
  }
  const depositId = await dbPush(env, `deposits/${user.telegramId}`, {
    userId: String(user.telegramId),
    amount,
    txHash,
    receiver: DEPOSIT_RECEIVER_WALLET,
    status: 'pending',
    ts: Date.now(),
  });
  return ok({ depositId });
}

// ───────────────────────── POST /verifyDeposit ───────────────────────
// نفس دورة التحقق الموجودة في نظام الإيداع العامل، مع تخزين Firebase
// وحساب رصيد PMT الحالي بدل KV المستخدم في التطبيق المنفصل.
async function handleVerifyDeposit(env, ctx) {
  const { user, body } = ctx;
  const depositId = String(body.depositId || '').trim();
  if (!depositId) return fail('معرّف الإيداع مفقود');
  const path = `deposits/${user.telegramId}/${depositId}`;
  const deposit = await dbGet(env, path);
  if (!deposit) return fail('الإيداع غير موجود', 404);
  if (deposit.status === 'completed') {
    const fresh = await dbGet(env, `users/${user.telegramId}`);
    return ok({ status: 'completed', amount: deposit.amount, tonBalance: Number(fresh?.tonBalance || 0) });
  }
  if (!env.TONCENTER_API_KEY) return fail('TONCENTER_API_KEY مفقود من إعدادات السيرفر', 500);

  const response = await fetch(
    `https://toncenter.com/api/v2/getTransactions?address=${DEPOSIT_RECEIVER_WALLET}&limit=20`,
    { headers: { 'X-API-Key': env.TONCENTER_API_KEY } },
  );
  if (!response.ok) return fail('تعذر التحقق من معاملة TON حاليًا', 502);
  const data = await response.json();
  const found = (data.result || []).some((tx) => {
    const inMsg = tx.in_msg;
    if (!inMsg) return false;
    const valueTon = Number(inMsg.value) / 1e9;
    return Math.abs(valueTon - Number(deposit.amount)) < 0.001 &&
      tx.transaction_id?.hash === deposit.txHash;
  });
  if (!found) return ok({ status: 'pending', tonBalance: Number(user.tonBalance || 0) });

  const freshUser = await dbGet(env, `users/${user.telegramId}`);
  const tonBalance = Number(freshUser?.tonBalance || 0) + Number(deposit.amount);
  await dbUpdate(env, `users/${user.telegramId}`, { tonBalance });
  await dbUpdate(env, path, { status: 'completed', completedAt: Date.now() });
  await addBalanceLog(env, user.telegramId, {
    type: 'deposit',
    amount: Number(deposit.amount),
    currency: 'TON',
    depositId,
    status: 'completed',
    ts: Date.now(),
  });
  return ok({ status: 'completed', amount: deposit.amount, tonBalance });
}

// Convert PMT to TON. No external payment or blockchain verification is used.
async function handleConvertPmtToTon(env, ctx) {
  const { user, body, config } = ctx;
  const pmtAmount = Math.floor(Number(body.pmtAmount));
  const rate = Number(config.tonConversionRate || DEFAULT_CONFIG.tonConversionRate || 10000);
  if (!Number.isFinite(pmtAmount) || pmtAmount <= 0) {
    return fail('المبلغ غير صالح');
  }
  const freshUser = await dbGet(env, `users/${user.telegramId}`);
  const pmtBalance = Number(freshUser?.balance || 0);
  if (pmtAmount > pmtBalance) return fail('Insufficient PMT balance.');
  const tonAdded = pmtAmount / rate;
  const tonBalance = Number(freshUser?.tonBalance || 0) + tonAdded;
  await dbUpdate(env, `users/${user.telegramId}`, {
    balance: pmtBalance - pmtAmount,
    tonBalance,
  });
  await addBalanceLog(env, user.telegramId, {
    type: 'pmt_to_ton',
    amount: -pmtAmount,
    currency: 'PMT',
    tonAdded,
    ts: Date.now(),
  });
  return ok({ shibaBalance: pmtBalance - pmtAmount, tonBalance, pmtAmount, tonAdded });
}

// ───────────────────────── POST /getWithdrawalsRecord ─────────────────────────
// يعرض قائمة عامة (لكل المستخدمين) بآخر عمليات السحب المكتملة فقط،
// لصفحة "Record" في الواجهة: صورة + اسم المستخدم + المبلغ + زر لعرض
// تفاصيل المعاملة. يعتمد على اللقطة (firstName/username/photoUrl)
// المخزّنة داخل withdrawals/{telegramId}/{id} وقت إنشاء الطلب، فمفيش
// حاجة إننا نقرأ users/ لكل مستخدم على حدة.
async function handleGetWithdrawalsRecord(env, ctx) {
  // بنجيب users/ كمان عشان لو أي بوت/سكريبت خارجي مسؤول عن الدفع الفعلي
  // عمل overwrite (PUT) على withdrawals/{telegramId}/{id} ومسح اللقطة
  // الأصلية (firstName/username/photoUrl)، نقدر نرجّع الاسم والصورة من
  // بيانات المستخدم الحالية بدل ما نعرض "User" وأفاتار فاضي.
  const [allWithdrawals, allUsers] = await Promise.all([
    dbGet(env, 'withdrawals'),
    dbGet(env, 'users'),
  ]);
  const list = [];
  if (allWithdrawals) {
    for (const [telegramId, userWithdrawals] of Object.entries(allWithdrawals)) {
      if (!userWithdrawals || typeof userWithdrawals !== 'object') continue;
      const u = (allUsers && allUsers[telegramId]) || {};
      for (const [id, w] of Object.entries(userWithdrawals)) {
        if (!w || (w.status !== 'completed' && w.status !== 'paid')) continue;
        list.push({
          id,
          telegramId,
          firstName: w.firstName || u.firstName || '',
          username: w.username || u.username || '',
          photoUrl: w.photoUrl || u.photoUrl || '',
          // بعض السجلات (اللي بيكتبها البوت الخارجي المسؤول عن الدفع)
          // بتستخدم أسماء حقول مختلفة (ton / sentAmount / address) بدل
          // (amount / netAmount / walletAddress)، فبنغطي الحالتين.
          amount: w.netAmount != null ? w.netAmount : (w.amount != null ? w.amount : (w.sentAmount != null ? w.sentAmount : (w.ton != null ? w.ton : 0))),
          requestedAmount: w.requestedAmount != null ? w.requestedAmount : w.amount,
          fee: w.fee || 0,
          currency: w.currency || 'TON',
          walletAddress: w.walletAddress || w.address || '',
          txHash: w.txHash || '',
          ts: w.ts || 0,
          completedAt: w.completedAt || w.ts || 0,
        });
      }
    }
  }
  list.sort((a, b) => (b.completedAt || b.ts || 0) - (a.completedAt || a.ts || 0));
  const limit = Math.min(Math.max(Number(ctx.body.limit) || 50, 1), 100);
  return ok({ withdrawals: list.slice(0, limit) });
}

// ════════════════════════════════════════════════════════════════════
//  جدول التوجيه (Routing Table)
// ════════════════════════════════════════════════════════════════════
const ROUTES = {
  '/getState': handleGetState,
  '/claimDailyBonus': handleClaimDailyBonus,
  '/redeemCode': handleRedeemCode,
  '/claimAdReward': handleClaimAdReward,
  '/startMining': handleStartMining,
  '/claimMining': handleClaimMining,
  '/playGame': handlePlayGame,
  '/startTask': handleStartTask,
  '/verifyTask': handleVerifyTask,
  '/claimTask': handleClaimTask,
  '/submitTaskSuggestion': handleSubmitTaskSuggestion,
  '/checkCombo': handleCheckCombo,
  '/spinWheel': handleSpinWheel,
  '/getReferrals': handleGetReferrals,
  '/checkForceSub': handleCheckForceSub,
  '/requestWithdrawal': handleRequestWithdrawal,
  '/getWithdrawalsRecord': handleGetWithdrawalsRecord,
  '/createDeposit': handleCreateDeposit,
  '/verifyDeposit': handleVerifyDeposit,
  '/convertPmtToTon': handleConvertPmtToTon,
};

// ════════════════════════════════════════════════════════════════════
//  نقطة الدخول الرئيسية للـ Worker
// ════════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (!env.FIREBASE_DATABASE_URL) {
      return fail('السيرفر غير مُهيّأ بشكل صحيح: FIREBASE_DATABASE_URL مفقود من متغيرات البيئة', 500);
    }

    // ملف TonConnect عام، مطلوب قبل فتح نافذة ربط المحفظة.
    if (request.method === 'GET' && new URL(request.url).pathname === '/tonconnect-manifest.json') {
      return json({
        // رابط الويب الذي سيظهر داخل بيانات TonConnect، وليس رابط الـ Worker.
        url: 'https://pmt gram.com',
        name: 'Pmt Gram',
        iconUrl: 'https://res.cloudinary.com/q1tmmkbe/image/upload/v1787498355/ChatGPT_Image_Aug_23_2026_06_20_10_PM.png',
      });
    }

    if (request.method !== 'POST') {
      return fail('Method Not Allowed', 405);
    }

    const url = new URL(request.url);
    let path = url.pathname;

    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      return fail('Body غير صالح، يجب أن يكون JSON');
    }

    if ((path === '/' || path === '') && body.action) {
      path = '/' + body.action;
      body = body.data || {};
    }

    const handler = ROUTES[path];
    if (!handler) {
      return fail('Endpoint غير موجود: ' + path, 404);
    }

    let initData = '';
    const authHeader = request.headers.get('Authorization') || '';
    const customHeader = request.headers.get('X-Telegram-Init-Data') || '';
    if (authHeader.startsWith('tma ')) initData = authHeader.slice(4);
    else if (authHeader.startsWith('Telegram ')) initData = authHeader.slice(9);
    else if (customHeader) initData = customHeader;
    else if (body._initData) initData = body._initData;

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(ip)) {
      return fail('تم تجاوز الحد المسموح من الطلبات، حاول لاحقًا', 429);
    }

    // ───── تحميل الإعدادات من Firebase (تشمل botToken/botUsername الفعليين) ─────
    let config;
    try {
      config = await getConfig(env);
    } catch (err) {
      return fail('فشل تحميل الإعدادات من قاعدة البيانات: ' + err.message, 500);
    }

    const botToken = config.botToken || env.BOT_TOKEN || '';
    const botUsername = config.botUsername || env.BOT_USERNAME || 'Pmt_Gram_Bot';

    if (!botToken) {
      return fail('لم يتم ضبط BOT_TOKEN (لا في Firebase config/botToken ولا في متغيرات البيئة)', 500);
    }

    const verification = await verifyTelegramInitData(initData, botToken);
    if (!verification.valid) {
      return fail('غير مصرح: ' + verification.error, 401);
    }

    try {
      // بعض إصدارات Telegram تعرض startapp داخل initDataUnsafe فقط في الواجهة.
      // نستخدمه كبديل بعد نجاح التحقق من initData، مع تقييد القيمة إلى صيغة
      // كود الإحالة التي ينشئها السيرفر.
      const rawStartParam = verification.startParam || body._startParam || '';
      const startParam = /^[A-Za-z0-9_-]{1,128}$/.test(String(rawStartParam))
        ? String(rawStartParam)
        : null;
      const user = await getOrCreateUser(env, verification.user, startParam, config, botToken);

      // ── حظر الحساب من لوحة التحكم أو نظام مكافحة الاحتيال ──────────
      // أي حساب موجود تحت blocked_accounts/{telegramId} يُمنع فورًا من
      // استخدام أي إندبوينت في الـ API، مش بس مكافآت الإحالة.
      try {
        const accountBlocked = await dbGet(env, `blocked_accounts/${user.telegramId}`);
        if (accountBlocked) {
          return fail(accountBlocked.reason || 'هذا الحساب محظور من استخدام البوت', 403);
        }
      } catch (_) {}
      // ─────────────────────────────────────────────────────────────

      // ── طبقة الحماية ضد الاحتيال ─────────────────────────────────
      const fraudResult = await checkAntiFraud(env, request, user.telegramId, body);
      // ─────────────────────────────────────────────────────────────

      const ctx = { user, body, tgUser: verification.user, config, botToken, botUsername, fraudResult };
      return await handler(env, ctx);
    } catch (err) {
      return fail('حدث خطأ في السيرفر: ' + err.message, 500);
    }
  },
};
