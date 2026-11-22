import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export const runtime = 'edge';

export type CurrentUserRole = 'owner' | 'admin' | null;

/**
 * 返回当前登录用户的管理角色，供前端决定是否展示 /admin 入口。
 * 与 /api/admin/config 使用相同的判定逻辑，但轻量且不暴露配置内容。
 * - localstorage 模式无多账户体系，始终返回 null
 * - 未登录 / 普通用户返回 null
 * - 站长（USERNAME）返回 owner，管理员返回 admin
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { role: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json(
      { role: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const username = authInfo.username;
  let role: CurrentUserRole = null;

  try {
    if (username === process.env.USERNAME) {
      role = 'owner';
    } else {
      const config = await getConfig();
      const user = config.UserConfig.Users.find((u) => u.username === username);
      if (user && user.role === 'admin') {
        role = 'admin';
      }
    }
  } catch {
    role = null;
  }

  return NextResponse.json(
    { role },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
