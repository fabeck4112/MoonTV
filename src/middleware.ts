/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { LOCAL_USER, verifyAuthToken } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过不需要认证的路径
  if (shouldSkipAuth(pathname)) {
    return NextResponse.next();
  }

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  // 如果没有设置密码，直接放行
  if (storageType === 'localstorage' && !process.env.PASSWORD) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get('auth');
  if (!authCookie) {
    return handleAuthFailure(request, pathname);
  }

  // 优先校验新版签名 token（含过期时间，防重放）
  const result = await verifyAuthToken(
    authCookie.value,
    process.env.PASSWORD || ''
  );
  if (result.ok) {
    // DB 模式必须持有真实用户名签发的 token；
    // localstorage 模式使用固定标识 LOCAL_USER。
    if (storageType === 'localstorage' || result.user !== LOCAL_USER) {
      return NextResponse.next();
    }
  }

  // 兼容旧 cookie：仅允许 DB 模式下带合法 HMAC 签名的历史会话平滑过渡
  // （旧 localstorage cookie 含明文密码，出于安全不再兼容，需重新登录）
  if (storageType !== 'localstorage') {
    const authInfo = getAuthInfoFromCookie(request);
    if (authInfo?.username && authInfo.signature && authInfo.timestamp) {
      const valid = await verifyLegacySignature(
        authInfo.username,
        authInfo.signature,
        process.env.PASSWORD || ''
      );
      if (valid) return NextResponse.next();
    }
  }

  return handleAuthFailure(request, pathname);
}

// 旧版签名校验：HMAC(username, PASSWORD)
async function verifyLegacySignature(
  data: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBuffer = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      encoder.encode(data)
    );
  } catch {
    return false;
  }
}

// 处理认证失败的情况
function handleAuthFailure(
  request: NextRequest,
  pathname: string
): NextResponse {
  // 如果是 API 路由，返回 401 状态码
  if (pathname.startsWith('/api')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 否则重定向到登录页面
  const loginUrl = new URL('/login', request.url);
  // 保留完整的URL，包括查询参数
  const fullUrl = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('redirect', fullUrl);
  return NextResponse.redirect(loginUrl);
}

// 判断是否需要跳过认证的路径
function shouldSkipAuth(pathname: string): boolean {
  const skipPaths = [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/manifest.json',
    '/icons/',
    '/logo.png',
    '/screenshot.png',
  ];

  return skipPaths.some((path) => pathname.startsWith(path));
}

// 配置middleware匹配规则
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|api/login|api/register|api/logout|api/cron|api/server-config).*)',
  ],
};
