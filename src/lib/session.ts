/**
 * 统一会话工具（Edge Runtime 兼容，仅使用 Web Crypto API）
 *
 * 设计目标：
 * - Cookie 中不再存放明文密码，彻底消除前端可读的密码泄露风险。
 * - auth cookie 使用 HMAC-SHA256 签名，设为 httpOnly，前端无法读取/篡改。
 * - 签名包含 timestamp，支持过期校验，防止重放攻击。
 * - 前端仅需展示用户名，另行下发一个非敏感的 username cookie。
 */

export interface AuthTokenPayload {
  /** 用户标识。数据库模式为用户名；localstorage 模式为固定值 'local' */
  u: string;
  /** 签发时间戳（毫秒） */
  t: number;
  /** 过期时间戳（毫秒） */
  e: number;
  /** HMAC-SHA256 签名（十六进制） */
  s: string;
}

/** Token 默认有效期：7 天 */
export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** localstorage 模式使用的固定用户标识 */
export const LOCAL_USER = 'local';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i] = byte;
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** 计算签名内容：u + '.' + t + '.' + e（不含签名本身） */
function signPayload(u: string, t: number, e: number): string {
  return `${u}.${t}.${e}`;
}

/**
 * 生成认证 token（JSON -> encodeURIComponent，保持与旧 cookie 解析兼容）
 */
export async function createAuthToken(
  user: string,
  secret: string,
  ttlMs = TOKEN_TTL_MS
): Promise<string> {
  const now = Date.now();
  const exp = now + ttlMs;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signPayload(user, now, exp))
  );
  const payload: AuthTokenPayload = {
    u: user,
    t: now,
    e: exp,
    s: bytesToHex(new Uint8Array(signature)),
  };
  return encodeURIComponent(JSON.stringify(payload));
}

/**
 * 校验认证 token：签名正确、未过期、签发时间合法
 */
export async function verifyAuthToken(
  token: string,
  secret: string
): Promise<{ ok: true; user: string } | { ok: false; reason: string }> {
  let payload: AuthTokenPayload;
  try {
    payload = JSON.parse(decodeURIComponent(token));
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }

  if (
    !payload ||
    typeof payload.u !== 'string' ||
    typeof payload.t !== 'number' ||
    typeof payload.e !== 'number' ||
    typeof payload.s !== 'string'
  ) {
    return { ok: false, reason: 'invalid-fields' };
  }

  const now = Date.now();
  // 允许 60 秒时钟偏移，防止签发时间略微超前导致误判
  if (payload.t > now + 60_000) {
    return { ok: false, reason: 'issued-in-future' };
  }
  if (payload.e <= now) {
    return { ok: false, reason: 'expired' };
  }

  const signatureBytes = hexToBytes(payload.s);
  if (!signatureBytes) {
    return { ok: false, reason: 'invalid-signature-format' };
  }

  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    new TextEncoder().encode(signPayload(payload.u, payload.t, payload.e))
  );

  if (!valid) {
    return { ok: false, reason: 'bad-signature' };
  }

  return { ok: true, user: payload.u };
}

/** 判断是否在生产环境（用于 secure cookie） */
export function isSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** auth cookie 通用属性（httpOnly，前端不可读） */
export function authCookieOptions(expires: Date) {
  return {
    path: '/',
    expires,
    sameSite: 'lax' as const,
    httpOnly: true,
    secure: isSecureCookie(),
  };
}

/** 清除 auth cookie 的属性 */
export function authCookieClearOptions() {
  return {
    path: '/',
    expires: new Date(0),
    sameSite: 'lax' as const,
    httpOnly: true,
    secure: isSecureCookie(),
  };
}

/** 非敏感的 username cookie 属性（前端需要读取用于展示/缓存） */
export function usernameCookieOptions(expires: Date) {
  return {
    path: '/',
    expires,
    sameSite: 'lax' as const,
    httpOnly: false,
    secure: isSecureCookie(),
  };
}
