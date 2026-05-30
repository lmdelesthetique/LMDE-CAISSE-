'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import type { DateRange } from '../page';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';

interface EmployeesReportProps {
  dateRange: DateRange;
}

interface EmployeeRow {
  employee_name: string;
  role: string;
  sessions: number;
  total_sales: number;
  total_tickets: number;
  avg_basket: string;
  hours_worked: string;
}

export default function EmployeesReport({ dateRange }: EmployeesReportProps) {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [roles, setRoles] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'total_sales' | 'total_tickets' | 'sessions'>('total_sales');

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      // Get employee sessions with sales data
      const { data: sessions } = await supabase
        .from('pos_employee_sessions')
        .select('employee_id, started_at, ended_at, total_sales, tickets_count, employees(first_name, last_name, role)')
        .gte('started_at', dateRange.from)
        .lte('started_at', dateRange.to + 'T23:59:59');

      if (sessions) {
        const empMap: Record<string, {
          name: string; role: string; sessions: number;
          total_sales: number; total_tickets: number; total_minutes: number;
        }> = {};

        sessions.forEach((s: any) => {
          const empId = s.employee_id ?? 'unknown';
          const emp = s.employees;
          const name = emp ? `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim() : 'Employé inconnu';
          const role = emp?.role ?? 'Inconnu';
          const sales = s.total_sales ?? 0;
          const tickets = s.tickets_count ?? 0;
          const start = s.started_at ? new Date(s.started_at).getTime() : 0;
          const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
          const minutes = start > 0 ? Math.round((end - start) / 60000) : 0;

          if (!empMap[empId]) empMap[empId] = { name, role, sessions: 0, total_sales: 0, total_tickets: 0, total_minutes: 0 };
          empMap[empId].sessions += 1;
          empMap[empId].total_sales += sales;
          empMap[empId].total_tickets += tickets;
          empMap[empId].total_minutes += minutes;
        });

        const mapped: EmployeeRow[] = Object.values(empMap).map((e) => ({
          employee_name: e.name,
          role: e.role,
          sessions: e.sessions,
          total_sales: Math.round(e.total_sales * 100) / 100,
          total_tickets: e.total_tickets,
          avg_basket: e.total_tickets > 0 ? (e.total_sales / e.total_tickets).toFixed(2) : '0.00',
          hours_worked: `${Math.floor(e.total_minutes / 60)}h${String(e.total_minutes % 60).padStart(2, '0')}`,
        }));

        setRows(mapped);
        const uniqueRoles = [...new Set(mapped.map((r) => r.role))].sort();
        setRoles(uniqueRoles);
      } else {
        // Fallback: load employees directly
        const { data: employees } = await supabase
          .from('employees')
          .select('id, first_name, last_name, role, status')
          .eq('status', 'active');

        if (employees) {
          const mapped: EmployeeRow[] = employees.map((e: any) => ({
            employee_name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim(),
            role: e.role ?? '-',
            sessions: 0,
            total_sales: 0,
            total_tickets: 0,
            avg_basket: '0.00',
            hours_worked: '0h00',
          }));
          setRows(mapped);
          const uniqueRoles = [...new Set(mapped.map((r) => r.role))].sort();
          setRoles(uniqueRoles);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows
    .filter((r) => filterRole === 'all' || r.role === filterRole)
    .sort((a, b) => {
      if (sortBy === 'total_tickets') return b.total_tickets - a.total_tickets;
      if (sortBy === 'sessions') return b.sessions - a.sessions;
      return b.total_sales - a.total_sales;
    });

  const totalSales = filtered.reduce((s, r) => s + r.total_sales, 0);
  const totalTickets = filtered.reduce((s, r) => s + r.total_tickets, 0);
  const totalSessions = filtered.reduce((s, r) => s + r.sessions, 0);

  const chartData = filtered.slice(0, 10).map((r) => ({
    name: r.employee_name.split(' ')[0],
    CA: r.total_sales,
    Tickets: r.total_tickets,
  }));

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin',
    manager: 'Manager',
    cashier: 'Caissier(e)',
    stock_manager: 'Resp. Stock',
    sales_rep: 'Commercial(e)',
  };

  const handleExportPDF = () => {
    exportToPDF({
      title: 'Rapport Employés',
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Employé', key: 'employee_name', width: 22 },
        { header: 'Rôle', key: 'role', width: 16 },
        { header: 'Sessions', key: 'sessions', width: 12 },
        { header: 'CA réalisé (€)', key: 'total_sales', width: 16 },
        { header: 'Tickets', key: 'total_tickets', width: 12 },
        { header: 'Panier moyen (€)', key: 'avg_basket', width: 18 },
        { header: 'Heures travaillées', key: 'hours_worked', width: 18 },
      ],
      rows: filtered,
      filename: `rapport-employes-${dateRange.from}-${dateRange.to}`,
    });
  };

  const handleExportExcel = () => {
    exportToExcel({
      title: 'Rapport Employés',
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Employé', key: 'employee_name', width: 22 },
        { header: 'Rôle', key: 'role', width: 16 },
        { header: 'Sessions', key: 'sessions', width: 12 },
        { header: 'CA réalisé (€)', key: 'total_sales', width: 16 },
        { header: 'Tickets', key: 'total_tickets', width: 12 },
        { header: 'Panier moyen (€)', key: 'avg_basket', width: 18 },
        { header: 'Heures travaillées', key: 'hours_worked', width: 18 },
      ],
      rows: filtered,
      filename: `rapport-employes-${dateRange.from}-${dateRange.to}`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'CA total équipe', value: `${totalSales.toFixed(2)} €`, icon: 'BanknotesIcon', color: 'bg-indigo-50 text-indigo-700' },
          { label: 'Tickets totaux', value: totalTickets, icon: 'ReceiptRefundIcon', color: 'bg-blue-50 text-blue-700' },
          { label: 'Sessions de caisse', value: totalSessions, icon: 'ComputerDesktopIcon', color: 'bg-emerald-50 text-emerald-700' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-border p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}>
              <Icon name={kpi.icon as Parameters<typeof Icon>[0]['name']} size={18} />
            </div>
            <p className="text-2xl font-bold text-foreground">{loading ? '—' : kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {!loading && chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">CA par employé</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [`${v.toFixed(2)} €`, 'CA']} />
              <Bar dataKey="CA" fill="#6366F1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none">
            <option value="all">Tous les rôles</option>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none">
            <option value="total_sales">Trier par CA</option>
            <option value="total_tickets">Trier par tickets</option>
            <option value="sessions">Trier par sessions</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="DocumentArrowDownIcon" size={14} /> PDF
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-medium text-emerald-700 transition-colors">
            <Icon name="TableCellsIcon" size={14} /> Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            <Icon name="ArrowPathIcon" size={18} className="animate-spin mr-2" /> Chargement...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Employé', 'Rôle', 'Sessions', 'CA réalisé', 'Tickets', 'Panier moyen', 'Heures'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Aucune donnée sur cette période</td></tr>
              ) : (
                filtered.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                    <td className="px-4 py-3 font-medium text-foreground">{row.employee_name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                        {ROLE_LABELS[row.role] ?? row.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{row.sessions}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{row.total_sales.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{row.total_tickets}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.avg_basket} €</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.hours_worked}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
