'use client';

import { useEffect, useState } from 'react';

export type AdminRole = 'owner' | 'admin' | null;

/**
 * 拉取当前用户的管理角色，用于决定是否展示 /admin 入口。
 * 角色由服务端接口判定（前端拿不到 USERNAME 环境变量）。
 */
export function useAdminRole(): { role: AdminRole; canManage: boolean } {
  const [role, setRole] = useState<AdminRole>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/role', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          const r = data.role as AdminRole;
          setRole(r === 'owner' || r === 'admin' ? r : null);
        }
      })
      .catch(() => {
        /* 拉取失败时保持隐藏，不影响正常使用 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { role, canManage: role === 'owner' || role === 'admin' };
}
