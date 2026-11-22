import { NextRequest } from 'next/server';

import { LOCAL_USER } from './session';

/**
 * 从认证 cookie 解析出的身份信息（服务端使用）
 *
 * 安全说明：auth cookie 为 httpOnly，前端不可读；签名校验在 middleware 中完成。
 * 这里仅解析出 username 供业务路由做角色/数据隔离判断。
 */
export interface AuthInfo {
  username?: string;
  /** 仅用于旧 cookie 兼容，不再是前端可见的密码 */
  password?: string;
  signature?: string;
  timestamp?: number;
}

// 从cookie获取认证信息 (服务端使用)
export function getAuthInfoFromCookie(request: NextRequest): AuthInfo | null {
  const authCookie = request.cookies.get('auth');
  if (!authCookie) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(authCookie.value);
    const data = JSON.parse(decoded);

    if (!data || typeof data !== 'object') return null;

    // 新版 token：{ u, t, e, s }
    if (typeof data.u === 'string') {
      return {
        // localstorage 模式使用固定标识，业务上等价于匿名用户
        username: data.u === LOCAL_USER ? undefined : data.u,
        timestamp: typeof data.t === 'number' ? data.t : undefined,
        signature: typeof data.s === 'string' ? data.s : undefined,
      };
    }

    // 旧版 cookie 兼容：{ username, password?, signature?, timestamp? }
    if (typeof data.username === 'string') {
      return {
        username: data.username,
        password: typeof data.password === 'string' ? data.password : undefined,
        signature:
          typeof data.signature === 'string' ? data.signature : undefined,
        timestamp:
          typeof data.timestamp === 'number' ? data.timestamp : undefined,
      };
    }

    // 更早期的 localstorage cookie：仅含 password
    if (typeof data.password === 'string') {
      return { password: data.password };
    }

    return null;
  } catch {
    return null;
  }
}

// 从浏览器 cookie 获取当前用户名（前端使用）
// 注意：auth cookie 已是 httpOnly，前端无法读取；这里读的是非敏感的 username cookie。
export function getAuthInfoFromBrowserCookie(): AuthInfo | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const trimmed = cookie.trim();
      const firstEqualIndex = trimmed.indexOf('=');
      if (firstEqualIndex > 0) {
        const key = trimmed.substring(0, firstEqualIndex);
        const value = trimmed.substring(firstEqualIndex + 1);
        if (key && value) {
          acc[key] = value;
        }
      }
      return acc;
    }, {} as Record<string, string>);

    const raw = cookies['username'];
    if (!raw) return null;

    // 处理可能的双重编码
    let decoded = decodeURIComponent(raw);
    if (decoded.includes('%')) {
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
        /* 保留一次解码结果 */
      }
    }

    if (!decoded || decoded === LOCAL_USER) return null;

    return { username: decoded };
  } catch {
    return null;
  }
}
