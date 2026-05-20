'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SyncStatus {
  table: string;
  label: string;
  count: number | null;
  rls: boolean | null;
  status: 'ok' | 'error' | 'loading';
  error?: string;
}

const TABLES_TO_CHECK = [
  { table: 'user_profiles', label: 'Profils utilisateurs' },
  { table: 'clients', label: 'Clients' },
  { table: 'products', label: 'Produits' },
  { table: 'categories', label: 'Catégories' },
  { table: 'suppliers', label: 'Fournisseurs' },
  { table: 'employees', label: 'Employés' },
  { table: 'reservations', label: 'Réservations' },
  { table: 'inventory_products', label: 'Inventaire' },
  { table: 'app_audit_log', label: 'Journal d\'audit' },
  { table: 'receipts', label: 'Tickets de caisse' },
  { table: 'pos_sessions', label: 'Sessions caisse' },
];

export default function UserSyncPage() {
  const supabase = createClient();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState('');

  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>(
    TABLES_TO_CHECK.map((t) => ({ ...t, count: null, rls: null, status: 'loading' }))
  );

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError('');
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      setUsersError(err.message || 'Erreur lors du chargement des utilisateurs');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const checkTableStatus = useCallback(async () => {
    const results: SyncStatus[] = [];
    for (const t of TABLES_TO_CHECK) {
      try {
        const { count, error } = await supabase
          .from(t.table)
          .select('*', { count: 'exact', head: true });
        if (error) {
          results.push({ ...t, count: null, rls: null, status: 'error', error: error.message });
        } else {
          results.push({ ...t, count: count ?? 0, rls: true, status: 'ok' });
        }
      } catch (err: any) {
        results.push({ ...t, count: null, rls: null, status: 'error', error: err.message });
      }
    }
    setSyncStatuses(results);
  }, []);

  useEffect(() => {
    loadUsers();
    checkTableStatus();
  }, [loadUsers, checkTableStatus]);

  const handleSyncUsers = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      // Re-check all tables
      await checkTableStatus();
      await loadUsers();
      setSyncResult('✅ Synchronisation terminée avec succès.');
    } catch (err: any) {
      setSyncResult('❌ Erreur : ' + (err.message || 'Synchronisation échouée'));
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: editingUser.full_name,
          role: editingUser.role,
          is_active: editingUser.is_active,
        })
        .eq('id', editingUser.id);
      if (error) throw error;
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      alert('Erreur : ' + err.message);
    } finally {
      setSavingUser(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    setCreateError('');
    setCreateSuccess('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: newUserEmail.trim(),
        password: newUserPassword,
        options: {
          data: {
            full_name: newUserName.trim(),
            role: 'admin',
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) throw error;
      setCreateSuccess(`✅ Utilisateur créé : ${newUserEmail}. Un email de confirmation a été envoyé.`);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserPassword('');
      await loadUsers();
    } catch (err: any) {
      setCreateError(err.message || 'Erreur lors de la création');
    } finally {
      setCreatingUser(false);
    }
  };

  const okCount = syncStatuses.filter((s) => s.status === 'ok').length;
  const errorCount = syncStatuses.filter((s) => s.status === 'error').length;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-700 text-foreground">Synchronisation Production</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gérez les utilisateurs et vérifiez l'état de la base de données en production
            </p>
          </div>
          <button
            onClick={handleSyncUsers}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {syncing ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Icon name="ArrowPathIcon" className="w-4 h-4" />
            )}
            {syncing ? 'Synchronisation…' : 'Synchroniser tout'}
          </button>
        </div>

        {syncResult && (
          <div className={`p-3 rounded-lg text-sm font-500 ${syncResult.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {syncResult}
          </div>
        )}

        {/* Database Status */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-600 text-foreground flex items-center gap-2">
              <Icon name="CircleStackIcon" className="w-4 h-4 text-primary" />
              État de la base de données
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                {okCount} OK
              </span>
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  {errorCount} Erreur
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {syncStatuses.map((s) => (
              <div
                key={s.table}
                className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
                  s.status === 'loading' ?'border-border bg-muted/30'
                    : s.status === 'ok' ?'border-emerald-200 bg-emerald-50' :'border-red-200 bg-red-50'
                }`}
              >
                <div>
                  <p className={`font-500 ${s.status === 'error' ? 'text-red-700' : 'text-foreground'}`}>
                    {s.label}
                  </p>
                  {s.status === 'error' && (
                    <p className="text-xs text-red-500 mt-0.5 truncate max-w-[160px]" title={s.error}>
                      {s.error}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {s.status === 'loading' ? (
                    <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  ) : s.status === 'ok' ? (
                    <span className="text-emerald-600 font-600">{s.count?.toLocaleString()}</span>
                  ) : (
                    <Icon name="ExclamationCircleIcon" className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Users List */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-600 text-foreground flex items-center gap-2">
              <Icon name="UsersIcon" className="w-4 h-4 text-primary" />
              Utilisateurs ({users.length})
            </h2>
            <button
              onClick={loadUsers}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Icon name="ArrowPathIcon" className="w-3.5 h-3.5" />
              Actualiser
            </button>
          </div>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : usersError ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {usersError}
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucun profil utilisateur trouvé. La migration doit être appliquée.
            </p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-600 text-sm">
                      {(u.full_name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-500 text-foreground">{u.full_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-500 ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {u.is_active ? 'Actif' : 'Inactif'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-500">
                      {u.role}
                    </span>
                    <button
                      onClick={() => setEditingUser({ ...u })}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Icon name="PencilSquareIcon" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit User Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-base font-600 text-foreground mb-4">Modifier l'utilisateur</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-500 text-muted-foreground mb-1">Email</label>
                  <input
                    type="text"
                    value={editingUser.email}
                    disabled
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs font-500 text-muted-foreground mb-1">Nom complet</label>
                  <input
                    type="text"
                    value={editingUser.full_name}
                    onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-500 text-muted-foreground mb-1">Rôle</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="employee">Employé</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={editingUser.is_active}
                    onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-border text-primary"
                  />
                  <label htmlFor="is_active" className="text-sm text-foreground">Compte actif</label>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-2 border border-border rounded-lg text-sm font-500 text-foreground hover:bg-muted/50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveUser}
                  disabled={savingUser}
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingUser ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create New User */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-600 text-foreground flex items-center gap-2 mb-4">
            <Icon name="UserPlusIcon" className="w-4 h-4 text-primary" />
            Créer un nouvel utilisateur
          </h2>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-500 text-muted-foreground mb-1">Email *</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                  placeholder="email@boutique.com"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-500 text-muted-foreground mb-1">Nom complet</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Prénom Nom"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-500 text-muted-foreground mb-1">Mot de passe *</label>
              <input
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Minimum 6 caractères"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {createError}
              </div>
            )}
            {createSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                {createSuccess}
              </div>
            )}
            <button
              type="submit"
              disabled={creatingUser || !newUserEmail || !newUserPassword}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {creatingUser ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <Icon name="UserPlusIcon" className="w-4 h-4" />
              )}
              {creatingUser ? 'Création…' : 'Créer l\'utilisateur'}
            </button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
