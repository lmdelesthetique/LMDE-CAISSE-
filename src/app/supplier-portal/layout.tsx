import { SupplierAuthProvider } from '@/contexts/SupplierAuthContext';

export default function SupplierPortalLayout({ children }: { children: React.ReactNode }) {
  return <SupplierAuthProvider>{children}</SupplierAuthProvider>;
}
