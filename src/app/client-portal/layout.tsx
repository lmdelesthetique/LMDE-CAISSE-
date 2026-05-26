import { ClientAuthProvider } from '@/contexts/ClientAuthContext';

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return <ClientAuthProvider>{children}</ClientAuthProvider>;
}
