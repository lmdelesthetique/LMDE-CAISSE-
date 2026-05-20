'use client';

import React, { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

const supabase = createClient();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  clientType: string;
  loyaltyPoints: string;
}

interface MappedClient {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  clientType: string;
  loyaltyPoints: number;
  rawRow: ParsedRow;
}

interface ImportPreview {
  total: number;
  toCreate: number;
  duplicates: number;
  errors: number;
  clients: Array<{
    client: MappedClient;
    action: 'create' | 'duplicate' | 'error';
    duplicateReason?: string;
    errorMsg?: string;
  }>;
}

// ─── Column auto-detection ────────────────────────────────────────────────────

const COLUMN_HINTS: Record<keyof ColumnMapping, string[]> = {
  firstName: ['prenom', 'prénom', 'first_name', 'firstname', 'first name', 'nom_prenom'],
  lastName: ['nom', 'last_name', 'lastname', 'last name', 'surname', 'family_name'],
  phone: ['telephone', 'téléphone', 'tel', 'phone', 'mobile', 'portable', 'gsm'],
  email: ['email', 'e-mail', 'mail', 'courriel', 'adresse_mail'],
  address: ['adresse', 'address', 'rue', 'street', 'domicile'],
  clientType: ['type', 'type_client', 'client_type', 'categorie', 'catégorie'],
  loyaltyPoints: ['points', 'fidelite', 'fidélité', 'loyalty', 'points_fidelite', 'points_fidélité'],
};

function autoDetectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { firstName: '', lastName: '', phone: '', email: '', address: '', clientType: '', loyaltyPoints: '' };
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  for (const [field, hints] of Object.entries(COLUMN_HINTS) as [keyof ColumnMapping, string[]][]) {
    for (const hint of hints) {
      const idx = lowerHeaders.findIndex((h) => h.includes(hint));
      if (idx !== -1) { mapping[field] = headers[idx]; break; }
    }
  }
  return mapping;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const cleanText = text.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const firstLine = lines[0];
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const delimiter = semicolonCount >= commaCount && semicolonCount >= tabCount ? ';' : tabCount >= commaCount ? '\t' : ',';
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; } }
      else if (ch === delimiter && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseRow(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim());
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.every((v) => !v.trim())) continue;
    const row: ParsedRow = {};
    headers.forEach((h, idx) => { row[h] = values[idx] !== undefined ? values[idx] : ''; });
    rows.push(row);
  }
  return { headers, rows };
}

function parseExcel(buffer: ArrayBuffer): { headers: string[]; rows: ParsedRow[] } {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const jsonData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (jsonData.length === 0) return { headers: [], rows: [] };
  const rawHeaders = jsonData[0] as any[];
  const headers = rawHeaders.map((h) => String(h ?? '').trim()).filter((h) => h !== '');
  if (headers.length === 0) return { headers: [], rows: [] };
  const rows: ParsedRow[] = [];
  for (let i = 1; i < jsonData.length; i++) {
    const values = jsonData[i] as any[];
    if (values.every((v) => v === '' || v === null || v === undefined)) continue;
    const row: ParsedRow = {};
    headers.forEach((h, idx) => { const val = values[idx]; row[h] = val !== undefined && val !== null ? String(val).trim() : ''; });
    rows.push(row);
  }
  return { headers, rows };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  firstName: 'Prénom *',
  lastName: 'Nom *',
  phone: 'Téléphone',
  email: 'Email',
  address: 'Adresse',
  clientType: 'Type client',
  loyaltyPoints: 'Points fidélité',
};

export default function ClientImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<PageStep>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ firstName: '', lastName: '', phone: '', email: '', address: '', clientType: '', loyaltyPoints: '' });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; errors: number } | null>(null);

  // ── File upload ──
  const handleFile = (file: File) => {
    setFileName(file.name);
    const lowerName = file.name.toLowerCase();
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const { headers: h, rows: r } = parseExcel(buffer);
        if (h.length === 0) return;
        setHeaders(h); setRows(r);
        setMapping(autoDetectColumns(h));
        setStep('mapping');
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const tryRead = (encoding: string, fallback?: string) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const isGarbled = text.includes('\uFFFD') || /[Ã©Ã¨Ã ÃªÃ®Ã´Ã¹Ã»Ã§]/.test(text);
        if (isGarbled && fallback) { tryRead(fallback); return; }
        const { headers: h, rows: r } = parseCSV(text);
        if (h.length === 0) return;
        setHeaders(h); setRows(r);
        setMapping(autoDetectColumns(h));
        setStep('mapping');
      };
      reader.readAsText(file, encoding);
    };
    tryRead('UTF-8', 'ISO-8859-1');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Build preview ──
  const buildPreview = useCallback(async () => {
    const mapped: MappedClient[] = rows
      .map((row) => ({
        firstName: mapping.firstName ? (row[mapping.firstName] || '').trim() : '',
        lastName: mapping.lastName ? (row[mapping.lastName] || '').trim() : '',
        phone: mapping.phone ? (row[mapping.phone] || '').trim() : '',
        email: mapping.email ? (row[mapping.email] || '').trim() : '',
        address: mapping.address ? (row[mapping.address] || '').trim() : '',
        clientType: mapping.clientType ? (row[mapping.clientType] || '').trim() : 'particulier',
        loyaltyPoints: mapping.loyaltyPoints ? (parseInt(row[mapping.loyaltyPoints] || '0') || 0) : 0,
        rawRow: row,
      }))
      .filter((c) => c.firstName.trim() || c.lastName.trim());

    // Fetch existing clients for duplicate detection
    const { data: existingClients } = await supabase
      .from('clients')
      .select('id, first_name, last_name, email, phone');

    const existingByEmail: Record<string, any> = {};
    const existingByPhone: Record<string, any> = {};
    const existingByName: Record<string, any> = {};
    (existingClients || []).forEach((c: any) => {
      if (c.email) existingByEmail[c.email.toLowerCase().trim()] = c;
      if (c.phone) existingByPhone[c.phone.replace(/\s/g, '')] = c;
      const nameKey = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().trim();
      if (nameKey) existingByName[nameKey] = c;
    });

    const result: ImportPreview = { total: mapped.length, toCreate: 0, duplicates: 0, errors: 0, clients: [] };
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    for (const client of mapped) {
      if (!client.firstName && !client.lastName) {
        result.errors++;
        result.clients.push({ client, action: 'error', errorMsg: 'Prénom et nom manquants' });
        continue;
      }

      // Check duplicates
      const emailKey = client.email.toLowerCase().trim();
      const phoneKey = client.phone.replace(/\s/g, '');
      const nameKey = `${client.firstName} ${client.lastName}`.toLowerCase().trim();

      let duplicateReason = '';
      if (emailKey && (existingByEmail[emailKey] || seenEmails.has(emailKey))) {
        duplicateReason = `Email déjà existant : ${client.email}`;
      } else if (phoneKey && (existingByPhone[phoneKey] || seenPhones.has(phoneKey))) {
        duplicateReason = `Téléphone déjà existant : ${client.phone}`;
      } else if (nameKey && existingByName[nameKey]) {
        duplicateReason = `Nom déjà existant : ${client.firstName} ${client.lastName}`;
      }

      if (duplicateReason) {
        result.duplicates++;
        result.clients.push({ client, action: 'duplicate', duplicateReason });
      } else {
        result.toCreate++;
        result.clients.push({ client, action: 'create' });
        if (emailKey) seenEmails.add(emailKey);
        if (phoneKey) seenPhones.add(phoneKey);
      }
    }

    setPreview(result);
    setStep('preview');
  }, [rows, mapping]);

  // ── Run import ──
  const runImport = async () => {
    if (!preview) return;
    setStep('importing');
    const log: string[] = [];
    let created = 0;
    let errors = 0;

    const addLog = (msg: string) => { log.push(msg); setImportLog([...log]); };

    const toCreate = preview.clients.filter((i) => i.action === 'create');
    addLog(`👥 Importation de ${toCreate.length} client(s)...`);

    const CHUNK = 50;
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      const chunk = toCreate.slice(i, i + CHUNK);
      const payloads = chunk.map(({ client }) => ({
        first_name: client.firstName,
        last_name: client.lastName,
        phone: client.phone || null,
        email: client.email || null,
        address: client.address || null,
        client_type: normalizeClientType(client.clientType),
        loyalty_points: client.loyaltyPoints || 0,
        loyalty_tier: 'bronze',
        total_spent: 0,
        visit_count: 0,
      }));

      const { error } = await supabase.from('clients').insert(payloads);
      if (error) {
        // Retry row by row
        addLog(`⚠️ Lot ${Math.floor(i / CHUNK) + 1} échoué — analyse ligne par ligne...`);
        for (const { client } of chunk) {
          const { error: rowErr } = await supabase.from('clients').insert({
            first_name: client.firstName,
            last_name: client.lastName,
            phone: client.phone || null,
            email: client.email || null,
            address: client.address || null,
            client_type: normalizeClientType(client.clientType),
            loyalty_points: client.loyaltyPoints || 0,
            loyalty_tier: 'bronze',
            total_spent: 0,
            visit_count: 0,
          });
          if (rowErr) { errors++; addLog(`❌ ${client.firstName} ${client.lastName} — ${rowErr.message}`); }
          else { created++; }
        }
      } else {
        created += chunk.length;
        addLog(`✅ ${Math.min(i + CHUNK, toCreate.length)}/${toCreate.length} clients créés...`);
      }
    }

    addLog('');
    addLog(`✅ Import terminé : ${created} créés, ${preview.duplicates} doublons ignorés, ${errors} erreurs`);
    setImportResult({ created, errors });
    setStep('done');
  };

  const reset = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setPreview(null);
    setImportLog([]);
    setImportResult(null);
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="bg-white border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/clients" className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Icon name="ArrowLeftIcon" size={18} />
            </Link>
            <div>
              <h1 className="text-lg font-600 text-foreground">Importation clients</h1>
              <p className="text-xs text-muted-foreground">Importez votre base clients depuis CSV ou Excel</p>
            </div>
          </div>
        </div>

        <div className="p-6 max-w-4xl mx-auto">
          {/* Step indicator */}
          {step !== 'done' && (
            <div className="flex items-center gap-2 mb-6">
              {(['upload', 'mapping', 'preview', 'importing'] as const).map((s, i) => {
                const steps = ['upload', 'mapping', 'preview', 'importing'];
                const currentIdx = steps.indexOf(step);
                const thisIdx = steps.indexOf(s);
                const labels = ['Fichier', 'Colonnes', 'Aperçu', 'Import'];
                return (
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-600 ${thisIdx < currentIdx ? 'bg-primary text-primary-foreground' : thisIdx === currentIdx ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 'bg-muted text-muted-foreground'}`}>
                        {thisIdx < currentIdx ? <Icon name="CheckIcon" size={12} /> : i + 1}
                      </div>
                      <span className={`text-xs font-500 ${thisIdx === currentIdx ? 'text-foreground' : 'text-muted-foreground'}`}>{labels[i]}</span>
                    </div>
                    {i < 3 && <div className="flex-1 h-px bg-border" />}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* ── Step: Upload ── */}
          {step === 'upload' && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="bg-white rounded-2xl border-2 border-dashed border-border hover:border-primary/50 transition-colors p-12 text-center cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.CSV,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }}
              />
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Icon name="UsersIcon" size={28} className="text-primary" />
              </div>
              <h3 className="text-base font-600 text-foreground mb-2">Déposez votre fichier clients ici</h3>
              <p className="text-sm text-muted-foreground mb-4">CSV ou Excel avec vos données clients</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-500">
                <Icon name="FolderOpenIcon" size={15} />
                Choisir un fichier CSV ou Excel
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Formats acceptés : CSV (séparateur ; ou , ou tabulation) · Excel (.xlsx, .xls) · Encodage UTF-8 ou Latin-1
              </p>
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto">
                {['Prénom / Nom', 'Téléphone', 'Email', 'Type client'].map((field) => (
                  <div key={field} className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground text-center">{field}</div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step: Mapping ── */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-border p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Icon name="TableCellsIcon" size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-600 text-foreground">Correspondance des colonnes</h2>
                    <p className="text-xs text-muted-foreground">{rows.length} lignes détectées dans <span className="font-500">{fileName}</span></p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map((field) => (
                    <div key={field}>
                      <label className="block text-xs font-500 text-muted-foreground mb-1.5">{FIELD_LABELS[field]}</label>
                      <select
                        value={mapping[field]}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">— Non mappé —</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      {mapping[field] && rows[0] && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">Ex : <span className="font-500 text-foreground">{rows[0][mapping[field]] || '—'}</span></p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview table */}
              <div className="bg-white rounded-2xl border border-border overflow-hidden">
                <div className="px-6 py-3 border-b border-border">
                  <p className="text-xs font-500 text-muted-foreground">Aperçu des 5 premières lignes</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        {headers.map((h) => <th key={h} className="px-3 py-2 text-left font-500 text-muted-foreground whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          {headers.map((h) => <td key={h} className="px-3 py-2 text-foreground whitespace-nowrap max-w-[160px] truncate">{row[h] || '—'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={reset} className="px-5 py-2.5 rounded-xl border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors">Changer de fichier</button>
                <button
                  onClick={buildPreview}
                  disabled={!mapping.firstName && !mapping.lastName}
                  className="flex-1 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Analyser et détecter les doublons →
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Clients détectés', value: preview.total, color: 'bg-blue-50 text-blue-700 border-blue-200' },
                  { label: 'À créer', value: preview.toCreate, color: 'bg-green-50 text-green-700 border-green-200' },
                  { label: 'Doublons', value: preview.duplicates, color: 'bg-orange-50 text-orange-700 border-orange-200' },
                  { label: 'Erreurs', value: preview.errors, color: 'bg-red-50 text-red-700 border-red-200' },
                ].map((kpi, i) => (
                  <div key={i} className={`rounded-xl border p-4 ${kpi.color}`}>
                    <p className="text-2xl font-700">{kpi.value}</p>
                    <p className="text-xs font-500 mt-0.5 opacity-80">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Client list */}
              <div className="bg-white rounded-2xl border border-border overflow-hidden">
                <div className="px-6 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-600 text-foreground">Détail des clients</p>
                  <p className="text-xs text-muted-foreground">Affichage des {Math.min(preview.clients.length, 50)} premiers</p>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                      <tr>
                        <th className="px-4 py-2 text-left font-500 text-muted-foreground">Statut</th>
                        <th className="px-4 py-2 text-left font-500 text-muted-foreground">Prénom</th>
                        <th className="px-4 py-2 text-left font-500 text-muted-foreground">Nom</th>
                        <th className="px-4 py-2 text-left font-500 text-muted-foreground">Téléphone</th>
                        <th className="px-4 py-2 text-left font-500 text-muted-foreground">Email</th>
                        <th className="px-4 py-2 text-left font-500 text-muted-foreground">Type</th>
                        <th className="px-4 py-2 text-left font-500 text-muted-foreground">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.clients.slice(0, 50).map((item, i) => {
                        const actionStyles: Record<string, string> = {
                          create: 'bg-green-100 text-green-700',
                          duplicate: 'bg-orange-100 text-orange-700',
                          error: 'bg-red-100 text-red-700',
                        };
                        const actionLabels: Record<string, string> = {
                          create: 'Créer',
                          duplicate: 'Doublon',
                          error: 'Erreur',
                        };
                        return (
                          <tr key={i} className={`border-t border-border hover:bg-muted/30 ${item.action === 'duplicate' ? 'opacity-60' : ''}`}>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-600 ${actionStyles[item.action]}`}>{actionLabels[item.action]}</span>
                            </td>
                            <td className="px-4 py-2 font-500 text-foreground">{item.client.firstName || '—'}</td>
                            <td className="px-4 py-2 font-500 text-foreground">{item.client.lastName || '—'}</td>
                            <td className="px-4 py-2 text-muted-foreground">{item.client.phone || '—'}</td>
                            <td className="px-4 py-2 text-muted-foreground max-w-[160px] truncate">{item.client.email || '—'}</td>
                            <td className="px-4 py-2 text-muted-foreground">{item.client.clientType || 'particulier'}</td>
                            <td className="px-4 py-2 text-muted-foreground text-[10px]">
                              {item.duplicateReason || item.errorMsg || ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {preview.duplicates > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
                  <Icon name="ExclamationTriangleIcon" size={16} className="text-orange-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-orange-700">
                    {preview.duplicates} doublon(s) détecté(s) — ces clients existent déjà et seront ignorés lors de l'importation.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep('mapping')} className="px-5 py-2.5 rounded-xl border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors">← Retour</button>
                <button
                  onClick={runImport}
                  disabled={preview.toCreate === 0}
                  className="flex-1 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Importer {preview.toCreate} client{preview.toCreate > 1 ? 's' : ''} →
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Importing ── */}
          {step === 'importing' && (
            <div className="bg-white rounded-2xl border border-border p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <h2 className="text-base font-600 text-foreground">Importation en cours...</h2>
              </div>
              <div className="bg-muted rounded-xl p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
                {importLog.map((line, i) => <p key={i} className="text-foreground">{line || '\u00A0'}</p>)}
              </div>
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && importResult && (
            <div className="bg-white rounded-2xl border border-border p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Icon name="CheckCircleIcon" size={32} className="text-green-600" />
              </div>
              <h2 className="text-lg font-600 text-foreground mb-2">Importation terminée !</h2>
              <p className="text-sm text-muted-foreground mb-6">Votre base clients a été mise à jour.</p>
              <div className="grid grid-cols-2 gap-4 mb-6 max-w-xs mx-auto">
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-2xl font-700 text-green-700">{importResult.created}</p>
                  <p className="text-xs text-green-600 font-500 mt-1">Clients créés</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-2xl font-700 text-red-700">{importResult.errors}</p>
                  <p className="text-xs text-red-600 font-500 mt-1">Erreurs</p>
                </div>
              </div>
              <div className="bg-muted rounded-xl p-4 font-mono text-xs space-y-0.5 max-h-40 overflow-y-auto text-left mb-6">
                {importLog.map((line, i) => <p key={i} className="text-foreground">{line || '\u00A0'}</p>)}
              </div>
              <div className="flex gap-3 justify-center">
                <button onClick={reset} className="px-5 py-2.5 rounded-xl border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors">Nouvelle importation</button>
                <Link href="/clients" className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors">
                  Voir les clients →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function normalizeClientType(raw: string): string {
  const lower = (raw || '').toLowerCase().trim();
  if (lower.includes('pro')) return 'professionnel';
  if (lower.includes('vip')) return 'vip';
  if (lower.includes('abonn')) return 'abonne';
  if (lower.includes('non')) return 'non_abonne';
  return 'particulier';
}
