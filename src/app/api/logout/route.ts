import { NextResponse } from 'next/server';

import { authCookieClearOptions, usernameCookieOptions } from '@/lib/session';

export const runtime = 'edge';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // 清除 auth cookie（httpOnly）
  response.cookies.set('auth', '', authCookieClearOptions());
  // 清除前端可读的 username cookie
  response.cookies.set('username', '', {
    ...usernameCookieOptions(new Date()),
    expires: new Date(0),
  });

  return response;
}
