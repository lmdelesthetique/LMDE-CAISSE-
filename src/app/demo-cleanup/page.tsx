'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';

interface CleanupTask {
  id: string;
  label: string;
  description: string;
  table: string;
  icon: string;
  color: string;
  count?: number;
  status: 'idle' | 'counting' | 'deleting' | 'done' | 'error';
  deleted?: number;
}

const INITIAL_TASKS: CleanupTask[] = [
  {
    id: 'products',
    label: 'Produits de démonstration',
    description: 'Supprime tous les produits créés pour les tests',
    table: 'products',
    icon: 'TagIcon',
    color: 'text-blue-600 bg-blue-50',
    status: 'idle',
  },
  {
    id: 'clients',
    label: 'Clients de test',
    description: 'Supprime tous les clients fictifs créés en démo',
    table: 'clients',
    icon: 'UsersIcon',
    color: 'text-purple-600 bg-purple-50',
    status: 'idle',
  },
  {
    id: 'receipts',
    label: 'Tickets de caisse de test',
    description: 'Supprime tous les tickets et transactions de démonstration',
    table: 'receipts',
    icon: 'ReceiptRefundIcon',
    color: 'text-amber-600 bg-amber-50',
    status: 'idle',
  },
  {
    id: 'reservations',
    label: 'Réservations de test',
    description: 'Supprime toutes les réservations fictives',
    table: 'reservations',
    icon: 'CalendarDaysIcon',
    color: 'text-emerald-600 bg-emerald-50',
    status: 'idle',
  },
  {
    id: 'employee_sales',
    label: 'Ventes employés de test',
    description: 'Supprime les données de ventes liées aux tests',
    table: 'employee_sales',
    icon: 'ChartBarIcon',
    color: 'text-indigo-600 bg-indigo-50',
    status: 'idle',
  },
  {
    id: 'inventory_movements',
    label: 'Mouvements de stock de test',
    description: 'Supprime les mouvements d\'inventaire fictifs',
    table: 'inventory_movements',
    icon: 'ArchiveBoxIcon',
    color: 'text-orange-600 bg-orange-50',
    status: 'idle',
  },
];

export default function DemoCleanupPage() {
  const [tasks, setTasks] = useState<CleanupTask[]>(INITIAL_TASKS);
  const [phase, setPhase] = useState<'idle' | 'counting' | 'confirm' | 'cleaning' | 'done'>('idle');
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set(INITIAL_TASKS.map(t => t.id)));

  const updateTask = (id: string, updates: Partial<CleanupTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const handleCount = async () => {
    setPhase('counting');
    setGlobalError(null);
    const supabase = createClient();

    for (const task of tasks) {
      if (!selectedTasks.has(task.id)) continue;
      updateTask(task.id, { status: 'counting' });
      try {
        const { count } = await supabase
          .from(task.table)
          .select('*', { count: 'exact', head: true });
        updateTask(task.id, { status: 'idle', count: count ?? 0 });
      } catch {
        updateTask(task.id, { status: 'idle', count: 0 });
      }
    }
    setPhase('confirm');
  };

  const handleCleanup = async () => {
    setPhase('cleaning');
    const supabase = createClient();
    let hasError = false;

    for (const task of tasks) {
      if (!selectedTasks.has(task.id)) continue;
      updateTask(task.id, { status: 'deleting' });
      try {
        // Delete all rows — using a filter that matches everything
        const { error } = await supabase
          .from(task.table)
          .delete()
          .gte('created_at', '2000-01-01');

        if (error) {
          updateTask(task.id, { status: 'error' });
          hasError = true;
        } else {
          updateTask(task.id, { status: 'done', deleted: task.count ?? 0 });
        }
      } catch (e: any) {
        updateTask(task.id, { status: 'error' });
        hasError = true;
      }
    }

    setPhase('done');
    if (hasError) {
      setGlobalError('Certaines tables n\'ont pas pu être nettoyées. Vérifiez les permissions RLS.');
    }
  };

  const handleReset = () => {
    setTasks(INITIAL_TASKS);
    setPhase('idle');
    setGlobalError(null);
    setSelectedTasks(new Set(INITIAL_TASKS.map(t => t.id)));
  };

  const totalCount = tasks.filter(t => selectedTasks.has(t.id)).reduce((sum, t) => sum + (t.count ?? 0), 0);
  const doneCount = tasks.filter(t => t.status === 'done').length;

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
              <Icon name="TrashIcon" size={24} className="text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-700 text-foreground">Nettoyage données démo</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Supprimez toutes les données de test avant l'ouverture</p>
            </div>
          </div>
        </div>

        {/* Warning banner */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Icon name="ExclamationTriangleIcon" size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-700 text-red-800">⚠️ Action irréversible</p>
            <p className="text-xs text-red-700 mt-1">
              Cette opération supprime définitivement toutes les données sélectionnées. 
              Assurez-vous d'avoir effectué une sauvegarde avant de procéder.
              <strong> Ne faites cela qu'une seule fois, juste avant l'ouverture réelle.</strong>
            </p>
          </div>
        </div>

        {/* Done state */}
        {phase === 'done' && (
          <div className={`rounded-xl p-5 mb-6 border ${globalError ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center gap-3">
              <Icon
                name={globalError ? 'ExclamationTriangleIcon' : 'CheckCircleIcon'}
                size={24}
                className={globalError ? 'text-amber-600' : 'text-emerald-600'}
              />
              <div>
                <p className={`font-700 ${globalError ? 'text-amber-800' : 'text-emerald-800'}`}>
                  {globalError ? 'Nettoyage partiel' : 'Nettoyage terminé avec succès !'}
                </p>
                <p className={`text-xs mt-0.5 ${globalError ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {doneCount} table{doneCount > 1 ? 's' : ''} nettoyée{doneCount > 1 ? 's' : ''} — Votre logiciel est prêt pour l'ouverture
                </p>
                {globalError && <p className="text-xs text-amber-700 mt-1">{globalError}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Task list */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <p className="text-sm font-600 text-foreground">Tables à nettoyer</p>
              {phase === 'idle' && (
                <button
                  onClick={() => {
                    if (selectedTasks.size === tasks.length) {
                      setSelectedTasks(new Set());
                    } else {
                      setSelectedTasks(new Set(tasks.map(t => t.id)));
                    }
                  }}
                  className="text-xs text-primary font-500 hover:underline"
                >
                  {selectedTasks.size === tasks.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border">
            {tasks.map(task => (
              <div key={task.id} className="px-5 py-4 flex items-center gap-4">
                {/* Checkbox */}
                {phase === 'idle' && (
                  <input
                    type="checkbox"
                    checked={selectedTasks.has(task.id)}
                    onChange={e => {
                      const next = new Set(selectedTasks);
                      if (e.target.checked) next.add(task.id);
                      else next.delete(task.id);
                      setSelectedTasks(next);
                    }}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30 shrink-0"
                  />
                )}

                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${task.color}`}>
                  <Icon name={task.icon as any} size={18} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-600 text-foreground">{task.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                </div>

                {/* Status / count */}
                <div className="shrink-0 text-right">
                  {task.status === 'counting' && (
                    <Icon name="ArrowPathIcon" size={16} className="animate-spin text-primary" />
                  )}
                  {task.status === 'deleting' && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600">
                      <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                      Suppression...
                    </div>
                  )}
                  {task.status === 'done' && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-500">
                      <Icon name="CheckCircleIcon" size={14} />
                      {task.deleted ?? 0} supprimé{(task.deleted ?? 0) > 1 ? 's' : ''}
                    </div>
                  )}
                  {task.status === 'error' && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 font-500">
                      <Icon name="XCircleIcon" size={14} />
                      Erreur
                    </div>
                  )}
                  {(task.status === 'idle' && task.count !== undefined) && (
                    <span className={`text-sm font-700 tabular-nums ${task.count > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {task.count} enregistrement{task.count > 1 ? 's' : ''}
                    </span>
                  )}
                  {(task.status === 'idle' && task.count === undefined && phase !== 'idle') && (
                    <span className="text-xs text-muted-foreground">Non sélectionné</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Count summary */}
        {phase === 'confirm' && totalCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-700 text-amber-800">
              {totalCount} enregistrement{totalCount > 1 ? 's' : ''} seront supprimés définitivement
            </p>
            <p className="text-xs text-amber-700 mt-1">Confirmez-vous la suppression de toutes ces données ?</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {phase === 'done' ? (
            <button
              onClick={handleReset}
              className="flex-1 py-3 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
            >
              Recommencer
            </button>
          ) : phase === 'confirm' ? (
            <>
              <button
                onClick={handleReset}
                className="flex-1 py-3 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleCleanup}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl text-sm font-700 hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                <Icon name="TrashIcon" size={16} />
                Confirmer la suppression
              </button>
            </>
          ) : (
            <button
              onClick={handleCount}
              disabled={phase === 'counting' || selectedTasks.size === 0}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {phase === 'counting' ? (
                <>
                  <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                  Comptage en cours...
                </>
              ) : (
                <>
                  <Icon name="MagnifyingGlassIcon" size={16} />
                  Analyser les données
                </>
              )}
            </button>
          )}
        </div>

        {/* Info footer */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <Icon name="InformationCircleIcon" size={16} className="text-blue-600 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-700 space-y-1">
              <p><strong>Étape 1 :</strong> Cliquez sur "Analyser les données" pour compter les enregistrements</p>
              <p><strong>Étape 2 :</strong> Vérifiez les comptages et confirmez la suppression</p>
              <p><strong>Étape 3 :</strong> Après le nettoyage, importez vos vrais produits via CSV</p>
              <p className="text-blue-600 font-500">Conseil : Faites une sauvegarde Supabase avant cette opération</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
