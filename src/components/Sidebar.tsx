'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  badge?: number;
  group?: string;
  children?: { id: string; label: string; href: string; icon: string; badgeText?: string }[];
}

const navItems: NavItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', icon: 'ChartBarIcon', href: '/dashboard', group: 'principal' },
  { id: 'nav-general-dashboard', label: 'Dashboard Général', icon: 'PresentationChartLineIcon', href: '/general-dashboard', group: 'principal' },
  { id: 'nav-pos', label: 'Caisse / Ventes', icon: 'ShoppingCartIcon', href: '/pos-sales-terminal', group: 'principal' },
  { id: 'nav-caisse-historique', label: 'Historique caisse', icon: 'ClockIcon', href: '/caisse-historique', group: 'principal' },
  { id: 'nav-cloture-caisse', label: 'Clôture caisse', icon: 'DocumentChartBarIcon', href: '/cloture-caisse', group: 'principal' },
  {
    id: 'nav-products',
    label: 'Produits',
    icon: 'TagIcon',
    href: '/product-management',
    group: 'catalogue',
    children: [
      { id: 'nav-products-list', label: 'Liste produits', href: '/product-management', icon: 'TagIcon' },
      { id: 'nav-products-import', label: 'Importer CSV', href: '/product-management/import', icon: 'ArrowUpTrayIcon' },
    ],
  },
  { id: 'nav-categories', label: 'Catégories', icon: 'RectangleGroupIcon', href: '/categories', group: 'catalogue' },
  { id: 'nav-promotions', label: 'Promotions', icon: 'TagIcon', href: '/promotions', group: 'catalogue' },
  { id: 'nav-stock', label: 'Stock', icon: 'ArchiveBoxIcon', href: '/stock', badge: 4, group: 'catalogue' },
  { id: 'nav-shopify-sync', label: 'Sync Shopify', icon: 'ArrowPathIcon', href: '/shopify-sync', group: 'catalogue' },
  {
    id: 'nav-inventory',
    label: 'Inventaire',
    icon: 'ClipboardDocumentListIcon',
    href: '/inventory',
    group: 'catalogue',
    children: [
      { id: 'nav-inventory-main', label: 'Vue d\'ensemble', href: '/inventory', icon: 'ClipboardDocumentListIcon' },
      { id: 'nav-inventory-scan', label: 'Inventaire par scan', href: '/inventory/scan', icon: 'QrCodeIcon', badgeText: 'NOUVEAU' },
      { id: 'nav-inventory-historique', label: 'Historique', href: '/inventory/historique', icon: 'ClockIcon' },
    ],
  },
  { id: 'nav-suppliers', label: 'Fournisseurs', icon: 'TruckIcon', href: '/suppliers', group: 'catalogue' },
  {
    id: 'nav-commandes-fo',
    label: 'Commandes Fournisseurs',
    icon: 'ShoppingBagIcon',
    href: '/commandes-fournisseurs',
    group: 'catalogue',
    children: [
      { id: 'nav-fo-nouvelle', label: 'Nouvelle commande', href: '/commandes-fournisseurs/nouvelle', icon: 'PlusCircleIcon' },
      { id: 'nav-fo-encours', label: 'En cours', href: '/commandes-fournisseurs', icon: 'ClockIcon' },
      { id: 'nav-fo-reassort', label: 'Réassort conseillé', href: '/commandes-fournisseurs/reassort', icon: 'ArrowPathIcon' },
      { id: 'nav-fo-depenses', label: 'Dépenses fournisseurs', href: '/commandes-fournisseurs/depenses', icon: 'ChartBarIcon' },
      { id: 'nav-fo-historique', label: 'Historique', href: '/commandes-fournisseurs/historique', icon: 'DocumentTextIcon' },
    ],
  },
  { id: 'nav-ambassadrices', label: 'Ambassadrices', icon: 'StarIcon', href: '/ambassadrices', group: 'gestion' },
  { id: 'nav-campagnes-ambassadrices', label: 'Campagnes', icon: 'MegaphoneIcon', href: '/campagnes-ambassadrices', group: 'gestion' },
  { id: 'nav-marketing', label: 'Marketing WhatsApp', icon: 'ChatBubbleLeftEllipsisIcon', href: '/marketing', group: 'gestion' },
  { id: 'nav-whatsapp-status', label: 'Statut WhatsApp', icon: 'SignalIcon', href: '/whatsapp-status', group: 'gestion' },
  { id: 'nav-livreurs', label: 'Livreurs', icon: 'UserGroupIcon', href: '/livreurs', group: 'gestion' },
  { id: 'nav-livraisons', label: 'Livraisons', icon: 'TruckIcon', href: '/livraisons', group: 'gestion' },
  { id: 'nav-expeditions', label: 'Expéditions', icon: 'ArchiveBoxArrowDownIcon', href: '/expeditions', group: 'gestion' },
  { id: 'nav-clients', label: 'Clients', icon: 'UsersIcon', href: '/clients', group: 'gestion' },
  { id: 'nav-abonnements', label: 'Abonnements', icon: 'ArchiveBoxIcon', href: '/abonnements', group: 'gestion' },
  { id: 'nav-reservations', label: 'Réservations', icon: 'CalendarDaysIcon', href: '/reservations', badge: 7, group: 'gestion' },
  { id: 'nav-parrainage', label: 'Parrainage', icon: 'UserGroupIcon', href: '/parrainage', group: 'gestion' },
  { id: 'nav-loyalty', label: 'Fidélité', icon: 'StarIcon', href: '/loyalty', group: 'gestion' },
  { id: 'nav-returns', label: 'Retours & Avoirs', icon: 'ArrowUturnLeftIcon', href: '/returns', group: 'gestion' },
  { id: 'nav-b2b-invoicing', label: 'Facturation B2B', icon: 'BriefcaseIcon', href: '/b2b-invoicing', group: 'gestion' },
  { id: 'nav-employees', label: 'Employés', icon: 'UserGroupIcon', href: '/employees', group: 'equipe' },
  { id: 'nav-reports', label: 'Rapports', icon: 'DocumentChartBarIcon', href: '/reports', group: 'analyse' },
  { id: 'nav-vat-report', label: 'Déclaration TVA 8.5%', icon: 'ReceiptPercentIcon', href: '/vat-report', group: 'analyse' },
  { id: 'nav-shift-reconciliation', label: 'Clôture de caisse', icon: 'ScaleIcon', href: '/shift-reconciliation', group: 'analyse' },
  { id: 'nav-backup-compliance', label: 'Sauvegarde & Conformité', icon: 'ShieldCheckIcon', href: '/backup-compliance', group: 'analyse' },
  { id: 'nav-demo-cleanup', label: 'Nettoyage démo', icon: 'TrashIcon', href: '/demo-cleanup', group: 'systeme' },
  { id: 'nav-settings', label: 'Paramètres', icon: 'Cog6ToothIcon', href: '/settings', group: 'systeme' },
  { id: 'nav-admin-config', label: 'Config. Admin', icon: 'WrenchScrewdriverIcon', href: '/admin-config', group: 'systeme' },
  { id: 'nav-supplier-portal-admin', label: 'Accès Portail Fournisseur', icon: 'UserPlusIcon', href: '/supplier-portal-admin', group: 'systeme' },
  { id: 'nav-user-sync', label: 'Sync Utilisateurs / BDD', icon: 'ArrowPathIcon', href: '/user-sync', group: 'systeme' },
];

const groups: { id: string; label: string }[] = [
  { id: 'principal', label: 'Principal' },
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'gestion', label: 'Gestion' },
  { id: 'equipe', label: 'Équipe' },
  { id: 'analyse', label: 'Analyse' },
  { id: 'systeme', label: 'Système' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    'nav-commandes-fo': pathname.startsWith('/commandes-fournisseurs'),
    'nav-products': pathname.startsWith('/product-management'),
    'nav-inventory': pathname.startsWith('/inventory'),
  });
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userInitials, setUserInitials] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.user_metadata;
        const fullName = meta?.full_name || meta?.name || '';
        const email = session.user.email || '';
        setUserEmail(email);
        if (fullName) {
          setUserName(fullName);
          const parts = fullName.trim().split(' ');
          setUserInitials(
            parts.length >= 2
              ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
              : fullName.slice(0, 2).toUpperCase()
          );
        } else {
          // Fallback to email prefix
          const emailName = email.split('@')[0] || '';
          setUserName(emailName);
          setUserInitials(emailName.slice(0, 2).toUpperCase());
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const meta = session.user.user_metadata;
        const fullName = meta?.full_name || meta?.name || '';
        const email = session.user.email || '';
        setUserEmail(email);
        if (fullName) {
          setUserName(fullName);
          const parts = fullName.trim().split(' ');
          setUserInitials(
            parts.length >= 2
              ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
              : fullName.slice(0, 2).toUpperCase()
          );
        } else {
          const emailName = email.split('@')[0] || '';
          setUserName(emailName);
          setUserInitials(emailName.slice(0, 2).toUpperCase());
        }
      } else {
        setUserName('');
        setUserEmail('');
        setUserInitials('');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <aside
      className={`
        fixed left-0 top-0 h-screen z-40 flex flex-col bg-white border-r border-border
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* Logo */}
      <div className={`flex items-center h-16 border-b border-border px-3 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <AppLogo size={32} />
            <span className="font-semibold text-[15px] text-foreground truncate">BeautyPOS</span>
          </div>
        )}
        {collapsed && <AppLogo size={32} />}
        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Réduire le menu"
          >
            <Icon name="ChevronLeftIcon" size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2">
        {groups.map((group) => {
          const items = navItems.filter((n) => n.group === group.id);
          if (items.length === 0) return null;
          return (
            <div key={`group-${group.id}`} className="mb-4">
              {!collapsed && (
                <p className="text-[10px] font-600 uppercase tracking-widest text-muted-foreground px-2 mb-1.5">
                  {group.label}
                </p>
              )}
              {items.map((item) => {
                const isActive = pathname === item.href || (item.children && pathname.startsWith(item.href));
                const isExpanded = expandedItems[item.id];
                const hasChildren = item.children && item.children.length > 0;

                return (
                  <div key={item.id}>
                    {hasChildren ? (
                      <button
                        onClick={() => !collapsed && toggleExpand(item.id)}
                        title={collapsed ? item.label : undefined}
                        className={`
                          w-full flex items-center gap-3 px-2.5 py-2 rounded-lg mb-0.5 text-sm font-medium
                          transition-all duration-150 group relative
                          ${isActive
                            ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }
                          ${collapsed ? 'justify-center' : ''}
                        `}
                      >
                        <Icon
                          name={item.icon as Parameters<typeof Icon>[0]['name']}
                          size={18}
                          className={isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}
                        />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate text-left">{item.label}</span>
                            <Icon
                              name={isExpanded ? 'ChevronDownIcon' : 'ChevronRightIcon'}
                              size={13}
                              className="text-muted-foreground shrink-0"
                            />
                          </>
                        )}
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={`
                          flex items-center gap-3 px-2.5 py-2 rounded-lg mb-0.5 text-sm font-medium
                          transition-all duration-150 group relative
                          ${isActive
                            ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }
                          ${collapsed ? 'justify-center' : ''}
                        `}
                      >
                        <Icon
                          name={item.icon as Parameters<typeof Icon>[0]['name']}
                          size={18}
                          className={isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}
                        />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.badge !== undefined && (
                              <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-600 rounded-full px-1.5 py-0.5 min-w-[18px] text-center tabular-nums">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                        {collapsed && item.badge !== undefined && (
                          <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
                        )}
                      </Link>
                    )}

                    {/* Sub-items */}
                    {hasChildren && isExpanded && !collapsed && (
                      <div className="ml-4 pl-3 border-l border-border mb-1">
                        {item.children!.map((child) => {
                          const childActive = pathname === child.href;
                          return (
                            <Link
                              key={child.id}
                              href={child.href}
                              className={`
                                flex items-center gap-2.5 px-2 py-1.5 rounded-lg mb-0.5 text-xs font-medium
                                transition-all duration-150
                                ${childActive
                                  ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }
                              `}
                            >
                              <Icon
                                name={child.icon as Parameters<typeof Icon>[0]['name']}
                                size={13}
                                className={childActive ? 'text-primary' : 'text-muted-foreground'}
                              />
                              <span className="truncate flex-1">{child.label}</span>
                              {child.badgeText && (
                                <span className="ml-1 bg-emerald-500 text-white text-[8px] font-700 px-1.5 py-0.5 rounded-full shrink-0 leading-none">
                                  {child.badgeText}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className={`border-t border-border p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <button
            onClick={onToggle}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Agrandir le menu"
          >
            <Icon name="ChevronRightIcon" size={16} />
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-600 text-primary">{userInitials || '?'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-500 text-foreground truncate">{userName || userEmail || 'Utilisateur'}</p>
              <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
              title="Se déconnecter"
            >
              <Icon name="ArrowRightOnRectangleIcon" size={15} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}