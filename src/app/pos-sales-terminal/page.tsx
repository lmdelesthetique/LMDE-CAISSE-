import React from 'react';
import AppLayout from '@/components/AppLayout';
import POSTerminal from './components/POSTerminal';
import { POSAuthProvider } from '@/contexts/POSAuthContext';

export default function POSSalesTerminalPage() {
  return (
    <AppLayout>
      <POSAuthProvider>
        <POSTerminal />
      </POSAuthProvider>
    </AppLayout>
  );
}
