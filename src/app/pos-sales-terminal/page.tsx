'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import POSTerminal from './components/POSTerminal';
import EmployeePINModal from './components/EmployeePINModal';
import { POSAuthProvider, usePOSAuth } from '@/contexts/POSAuthContext';

function POSGuard() {
  const { isLocked } = usePOSAuth();

  // Keep POSTerminal always mounted so held tickets / cart state survive
  // employee lock/unlock cycles. EmployeePINModal overlays on top (fixed inset-0).
  return (
    <>
      <POSTerminal />
      {isLocked && <EmployeePINModal />}
    </>
  );
}

export default function POSSalesTerminalPage() {
  return (
    <AppLayout>
      <POSAuthProvider>
        <POSGuard />
      </POSAuthProvider>
    </AppLayout>
  );
}
