import { useMemo } from 'react';

export interface UserProfileForPermission {
  role?: 'admin' | 'accountant' | 'cashier' | 'viewer';
  [key: string]: any;
}

export function usePermission(profile: UserProfileForPermission | null | undefined) {
  const role = profile?.role || 'viewer';

  return useMemo(() => {
    const isAdmin = role === 'admin';
    const isAccountant = role === 'accountant';
    const isCashier = role === 'cashier';
    const isViewer = role === 'viewer';

    return {
      role,
      isAdmin,
      isAccountant,
      isCashier,
      isViewer,
      canViewInventory: true,
      canEditInventory: isAdmin || isAccountant,
      canEditProduct: isAdmin || isAccountant,
      canDeleteProduct: isAdmin,
      isReadOnly: isViewer,
    };
  }, [role]);
}
