'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface PortalUser {
  id: string;
  supplier_id: string;
  pin_code: string | null;
  portal_email: string | null;
  is_active: boolean;
  created_at: string;
  suppliers?: { company_name: string };
}

export default function SupplierPortalAdminPage() {
  const supabase = createClient();
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase
      .from('supplier_portal_users')
      .select('id, supplier_id, pin_code, portal_email, is_active, created_at, suppliers(company_name)')
      .order('created_at', { ascending: false });
    setPortalUsers((data ?? []) as PortalUser[]);
    setLoading(false);
  }

  async function toggleActive(userId: string, current: boolean) {
    await supabase.from('supplier_portal_users').update({ is_active: !current }).eq('id', userId);
    await loadData();
  }

  async function revokeAccess(userId: string, supplierId: string) {
    await supabase.from('supplier_portal_users').delete().eq('id', userId);
    await supabase.from('suppliers').update({ portal_login: null, portal_password_plain: null }).eq('id', supplierId);
    await loadData();
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon name="KeyIcon" size={18} className="text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-700 text-foreground">Portail Fournisseur — Accès</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Gérer les codes PIN d'accès fournisseurs</p>
              </div>
            </div>
            <Link
              href="/suppliers"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Icon name="PlusIcon" size={15} />
              Créer un accès (via fiche fournisseur)
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Info banner */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6">
            <Icon name="InformationCircleIcon" size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-600 text-blue-800">Comment créer un accès fournisseur ?</p>
              <p className="text-sm text-blue-700 mt-0.5">
                Ouvrez la <Link href="/suppliers" className="underline font-medium">fiche d'un fournisseur</Link>, puis cliquez sur le bouton{' '}
                <strong>« Générer accès fournisseur »</strong>. Le système génère automatiquement un code PIN à 6 chiffres que vous pouvez copier ou envoyer par WhatsApp.
              </p>
            </div>
          </div>

          {/* Connection info */}
          <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl mb-6">
            <Icon name="LinkIcon" size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-600 text-emerald-800">URL du portail fournisseur</p>
              <a
                href="/supplier-portal/login"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-emerald-700 underline font-mono"
              >
                {typeof window !== 'undefined' ? window.location.origin : ''}/supplier-portal/login
              </a>
            </div>
          </div>

          {/* Existing accounts */}
          <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-600 text-foreground">Comptes actifs ({portalUsers.length})</h2>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : portalUsers.length === 0 ? (
              <div className="py-12 text-center">
                <Icon name="UserGroupIcon" size={36} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Aucun compte fournisseur créé</p>
                <p className="text-xs text-muted-foreground mt-1">Ouvrez une fiche fournisseur et cliquez sur "Générer accès fournisseur"</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {portalUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <div>
                        <p className="text-sm font-600 text-foreground">{user.suppliers?.company_name ?? '—'}</p>
                        {user.pin_code ? (
                          <p className="text-xs text-muted-foreground font-mono tracking-widest">
                            PIN : <span className="font-700 text-foreground">{user.pin_code}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-red-500">Aucun PIN — régénérer depuis la fiche</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                        {user.is_active ? 'Actif' : 'Désactivé'}
                      </span>
                      <button
                        onClick={() => toggleActive(user.id, user.is_active)}
                        className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        {user.is_active ? 'Désactiver' : 'Activer'}
                      </button>
                      {user.supplier_id && (
                        <Link
                          href={`/suppliers/${user.supplier_id}`}
                          className="px-3 py-1.5 text-xs border border-border rounded-lg text-primary hover:bg-primary/5 transition-colors"
                        >
                          Voir fiche
                        </Link>
                      )}
                      <button
                        onClick={() => revokeAccess(user.id, user.supplier_id)}
                        className="px-3 py-1.5 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Révoquer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
