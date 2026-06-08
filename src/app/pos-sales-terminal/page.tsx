'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import POSTerminal from './components/POSTerminal';
import EmployeePINModal from './components/EmployeePINModal';
import { POSAuthProvider, usePOSAuth } from '@/contexts/POSAuthContext';

function POSGuard() {
  const { isLocked } = usePOSAuth();

  if (isLocked) {
    return <EmployeePINModal />;
  }

  return <POSTerminal />;
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
