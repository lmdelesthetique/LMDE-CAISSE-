import { redirect } from 'next/navigation';

// Always redirect supplier portal root to login
export default function SupplierPortalRoot() {
  redirect('/supplier-portal/login');
}
