'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  employeeService,
  type Employee,
  type EmployeeRole,
  type EmployeeStatus,
  ROLE_CONFIG,
  STATUS_CONFIG,
  PERMISSION_LABELS,
  type EmployeePermissions,
} from '@/lib/services/employeeService';
import EmployeeFormModal from './components/EmployeeFormModal';
import EmployeeDetailPanel from './components/EmployeeDetailPanel';
import AnnualBonusProgress from './components/AnnualBonusProgress';

type FilterRole = EmployeeRole | 'all';
type FilterStatus = EmployeeStatus | 'all';

const ROLE_FILTERS: { id: FilterRole; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'admin', label: 'Admin' },
  { id: 'manager', label: 'Manager' },
  { id: 'cashier', label: 'Caissier(e)' },
  { id: 'stock_manager', label: 'Resp. Stock' },
  { id: 'sales_rep', label: 'Commercial(e)' },
];

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<FilterRole>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const data = await employeeService.getAll();
      setEmployees(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const handleSearch = useCallback(async (val: string) => {
    setSearch(val);
    if (val.trim().length >= 2) {
      const results = await employeeService.search(val.trim());
      setEmployees(results);
    } else if (val.trim().length === 0) {
      loadEmployees();
    }
  }, [loadEmployees]);

  const filtered = employees.filter((e) => {
    if (filterRole !== 'all' && e.role !== filterRole) return false;
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    return true;
  });

  const handleSaved = (emp: Employee) => {
    setEmployees((prev) => {
      const idx = prev.findIndex((e) => e.id === emp.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = emp;
        return next;
      }
      return [emp, ...prev];
    });
    setShowForm(false);
    setEditingEmployee(null);
  };

  const handleDeleted = () => {
    if (selectedEmployee) {
      setEmployees((prev) => prev.filter((e) => e.id !== selectedEmployee.id));
      setSelectedEmployee(null);
    }
  };

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setShowForm(true);
    setSelectedEmployee(null);
  };

  // Summary stats
  const activeCount = employees.filter((e) => e.status === 'active').length;
  const adminCount = employees.filter((e) => e.role === 'admin').length;
  const totalObjective = employees.reduce((sum, e) => sum + e.monthlyObjective, 0);

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Employés</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gérez les profils, permissions et performances de votre équipe
            </p>
          </div>
          <button
            onClick={() => { setEditingEmployee(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-600 hover:bg-primary/90 transition-colors shrink-0"
          >
            <Icon name="PlusIcon" size={16} />
            Nouvel employé
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total employés', value: String(employees.length), icon: 'UserGroupIcon', color: 'text-blue-600 bg-blue-50' },
            { label: 'Actifs', value: String(activeCount), icon: 'CheckCircleIcon', color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Admins', value: String(adminCount), icon: 'ShieldCheckIcon', color: 'text-purple-600 bg-purple-50' },
            { label: 'Objectif mensuel total', value: `${totalObjective.toLocaleString('fr-FR')} €`, icon: 'ChartBarIcon', color: 'text-amber-600 bg-amber-50' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kpi.color}`}>
                <Icon name={kpi.icon as any} size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-700 text-foreground truncate">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Annual Bonus Progress */}
        {!loading && employees.length > 0 && (
          <div className="mb-6">
            <AnnualBonusProgress employees={employees} />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-border rounded-xl p-4 mb-5 flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Rechercher par nom, email, téléphone..."
              className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
          >
            <option value="all">Tous les statuts</option>
            {(Object.keys(STATUS_CONFIG) as EmployeeStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>

        {/* Role filter tabs */}
        <div className="flex gap-2 flex-wrap mb-5">
          {ROLE_FILTERS.map((f) => {
            const count = f.id === 'all' ? employees.length : employees.filter((e) => e.role === f.id).length;
            return (
              <button
                key={f.id}
                onClick={() => setFilterRole(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-500 transition-colors ${
                  filterRole === f.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white border border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {f.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterRole === f.id ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Employee grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Icon name="ArrowPathIcon" size={28} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Icon name="UserGroupIcon" size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-base font-500">Aucun employé trouvé</p>
            <p className="text-sm mt-1">Modifiez vos filtres ou créez un nouvel employé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((emp) => {
              const roleConf = ROLE_CONFIG[emp.role];
              const statusConf = STATUS_CONFIG[emp.status];
              const activePerms = (Object.keys(emp.permissions) as (keyof EmployeePermissions)[]).filter((k) => emp.permissions[k]);
              return (
                <div
                  key={emp.id}
                  onClick={() => setSelectedEmployee(emp)}
                  className="bg-white border border-border rounded-2xl p-5 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
                >
                  {/* Top row */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                      <span className="text-base font-700 text-primary">{emp.avatarInitials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-700 text-foreground truncate">{emp.fullName}</p>
                      {emp.email && <p className="text-xs text-muted-foreground truncate">{emp.email}</p>}
                      {emp.phone && <p className="text-xs text-muted-foreground">{emp.phone}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`inline-flex items-center gap-1 text-xs font-600 px-2 py-0.5 rounded-full border ${roleConf.color}`}>
                        <Icon name={roleConf.icon as any} size={10} />
                        {roleConf.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs font-500 px-2 py-0.5 rounded-full border ${statusConf.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                        {statusConf.label}
                      </span>
                    </div>
                  </div>

                  {/* Permissions preview */}
                  <div className="flex flex-wrap gap-1 mb-4">
                    {activePerms.slice(0, 4).map((key) => (
                      <span key={key} className="inline-flex items-center gap-1 text-[10px] font-500 text-primary bg-primary/5 px-2 py-0.5 rounded-full">
                        <Icon name={PERMISSION_LABELS[key].icon as any} size={9} />
                        {PERMISSION_LABELS[key].label}
                      </span>
                    ))}
                    {activePerms.length > 4 && (
                      <span className="text-[10px] font-500 text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        +{activePerms.length - 4}
                      </span>
                    )}
                  </div>

                  {/* Bottom row */}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon name="ChartBarIcon" size={12} />
                      <span>Obj. : {emp.monthlyObjective.toLocaleString('fr-FR')} €/mois</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {emp.posPin && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          <Icon name="KeyIcon" size={9} />
                          PIN
                        </span>
                      )}
                      {emp.hireDate && (
                        <span className="text-[10px] text-muted-foreground">
                          Depuis {new Date(emp.hireDate).getFullYear()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <EmployeeFormModal
          employee={editingEmployee}
          onClose={() => { setShowForm(false); setEditingEmployee(null); }}
          onSaved={handleSaved}
        />
      )}

      {selectedEmployee && !showForm && (
        <EmployeeDetailPanel
          employee={selectedEmployee}
          onEdit={() => openEdit(selectedEmployee)}
          onClose={() => setSelectedEmployee(null)}
          onDeleted={handleDeleted}
        />
      )}
    </AppLayout>
  );
}
