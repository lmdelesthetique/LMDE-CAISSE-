'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { categoryStore } from '@/lib/stores/dataStore';
import { fetchAll } from '@/lib/utils/fetchAll';
import * as XLSX from 'xlsx';

const supabase = createClient();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  code: string;
  name: string;
  priceTTC: string;
  barcode: string;
  ref: string;
  category: string;
}

interface MappedProduct {
  code: string;
  name: string;
  priceTTC: number;
  barcode: string;
  ref: string;
  category: string;
  rawRow: ParsedRow;
}

interface ImportSummary {
  totalDetected: number;
  toCreate: number;
  toUpdate: number;
  duplicates: number;
  errors: number;
  barcodesReplaced: number;
  products: Array<{
    product: MappedProduct;
    action: 'create' | 'update' | 'duplicate' | 'error';
    existingId?: string;
    oldBarcode?: string;
    errorMsg?: string;
  }>;
}

interface ImportHistoryEntry {
  id: string;
  imported_at: string;
  file_name: string;
  imported_by: string;
  total_detected: number;
  total_created: number;
  total_updated: number;
  total_duplicates: number;
  total_errors: number;
  total_barcodes_replaced: number;
}

// ─── Column auto-detection heuristics ────────────────────────────────────────

const COLUMN_HINTS: Record<keyof ColumnMapping, string[]> = {
  code: ['code', 'code produit', 'id', 'article', 'sku', 'product_code', 'code_article'],
  name: ['libelle', 'libellé', 'nom', 'designation', 'désignation', 'name', 'product', 'produit', 'article'],
  priceTTC: ['prix ttc', 'prix_ttc', 'prixttc', 'price', 'prix', 'tarif', 'montant', 'ttc'],
  barcode: ['barcode', 'code barre', 'code_barre', 'ean', 'ean13', 'gtin', 'upc', 'code-barres'],
  ref: ['ref', 'référence', 'reference', 'ref_produit', 'ref produit'],
  category: ['categorie', 'catégorie', 'category', 'famille', 'type', 'rayon'],
};

function autoDetectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { code: '', name: '', priceTTC: '', barcode: '', ref: '', category: '' };
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [field, hints] of Object.entries(COLUMN_HINTS) as [keyof ColumnMapping, string[]][]) {
    for (const hint of hints) {
      const idx = lowerHeaders.findIndex((h) => h.includes(hint));
      if (idx !== -1) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }
  return mapping;
}

function parsePrice(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[€$£\s]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  // Strip BOM (UTF-8 BOM = \uFEFF, sometimes present in Excel-exported CSVs)
  const cleanText = text.replace(/^\uFEFF/, '');

  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter — count occurrences in first line to pick the most likely one
  const firstLine = lines[0];
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const delimiter =
    semicolonCount >= commaCount && semicolonCount >= tabCount
      ? ';'
      : tabCount >= commaCount
      ? '\t' :',';

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        // Handle escaped double-quotes ("")
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim());
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    // Skip rows where ALL values are empty
    if (values.every((v) => !v.trim())) continue;
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

// ─── Excel parser ─────────────────────────────────────────────────────────────

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
    // Skip fully empty rows
    if (values.every((v) => v === '' || v === null || v === undefined)) continue;
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      const val = values[idx];
      row[h] = val !== undefined && val !== null ? String(val).trim() : '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

// ─── Demo Cleanup Modal ───────────────────────────────────────────────────────

interface CleanupModalProps {
  onClose: () => void;
  onDone: () => void;
}

function DemoCleanupModal({ onClose, onDone }: CleanupModalProps) {
  const [step, setStep] = useState<'confirm' | 'running' | 'done'>('confirm');
  const [log, setLog] = useState<string[]>([]);
  const [counts, setCounts] = useState({ products: 0, clients: 0, tickets: 0, orders: 0 });

  const addLog = (msg: string) => setLog((prev) => [...prev, msg]);

  const runCleanup = async () => {
    setStep('running');
    const results = { products: 0, clients: 0, tickets: 0, orders: 0 };

    try {
      // Delete demo/seed products (those with ref starting with DEMO or seed data)
      addLog('🔍 Recherche des produits de démonstration...');
      const { data: demoProds, error: prodErr } = await supabase
        .from('products')
        .select('id, name, ref')
        .or('ref.ilike.DEMO%,ref.ilike.TEST%,name.ilike.%demo%,name.ilike.%test%,name.ilike.%exemple%');

      if (!prodErr && demoProds) {
        results.products = demoProds.length;
        if (demoProds.length > 0) {
          const ids = demoProds.map((p: any) => p.id);
          await supabase.from('products').delete().in('id', ids);
          addLog(`✅ ${demoProds.length} produit(s) démo supprimé(s)`);
        } else {
          addLog('ℹ️ Aucun produit démo détecté');
        }
      }

      // Delete demo clients
      addLog('🔍 Recherche des clients de démonstration...');
      const { data: demoClients } = await supabase
        .from('clients')
        .select('id')
        .or('email.ilike.%demo%,email.ilike.%test%,email.ilike.%exemple%,first_name.ilike.%demo%,first_name.ilike.%test%');

      if (demoClients && demoClients.length > 0) {
        results.clients = demoClients.length;
        const ids = demoClients.map((c: any) => c.id);
        await supabase.from('clients').delete().in('id', ids);
        addLog(`✅ ${demoClients.length} client(s) démo supprimé(s)`);
      } else {
        addLog('ℹ️ Aucun client démo détecté');
      }

      // Delete demo tickets/sales
      addLog('🔍 Recherche des tickets de démonstration...');
      const { data: demoTickets } = await supabase
        .from('sales')
        .select('id')
        .ilike('notes', '%demo%');

      if (demoTickets && demoTickets.length > 0) {
        results.tickets = demoTickets.length;
        const ids = demoTickets.map((t: any) => t.id);
        await supabase.from('sales').delete().in('id', ids);
        addLog(`✅ ${demoTickets.length} ticket(s) démo supprimé(s)`);
      } else {
        addLog('ℹ️ Aucun ticket démo détecté');
      }

      // Delete demo supplier orders
      addLog('🔍 Recherche des commandes fictives...');
      const { data: demoOrders } = await supabase
        .from('supplier_orders')
        .select('id')
        .ilike('notes', '%demo%');

      if (demoOrders && demoOrders.length > 0) {
        results.orders = demoOrders.length;
        const ids = demoOrders.map((o: any) => o.id);
        await supabase.from('supplier_orders').delete().in('id', ids);
        addLog(`✅ ${demoOrders.length} commande(s) fictive(s) supprimée(s)`);
      } else {
        addLog('ℹ️ Aucune commande fictive détectée');
      }

      setCounts(results);
      addLog('');
      addLog('✅ Nettoyage terminé. Les paramètres système sont intacts.');
      setStep('done');
    } catch (err: any) {
      addLog(`❌ Erreur : ${err.message}`);
      setStep('done');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
              <Icon name="TrashIcon" size={18} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-600 text-foreground">Nettoyage données démo</h2>
              <p className="text-xs text-muted-foreground">Supprime les données fictives sans toucher aux paramètres</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="p-6">
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex gap-3">
                  <Icon name="ExclamationTriangleIcon" size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-500 text-amber-800">Action irréversible</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Cette action va supprimer définitivement les données de démonstration. Les paramètres système, les vrais produits et les vraies données ne seront pas affectés.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-500 text-foreground">Éléments qui seront supprimés :</p>
                {[
                  { icon: 'TagIcon', label: 'Produits démo (ref/nom contenant "demo", "test", "exemple")' },
                  { icon: 'UsersIcon', label: 'Clients démo (email/prénom contenant "demo", "test")' },
                  { icon: 'ReceiptPercentIcon', label: 'Tickets avec notes "demo"' },
                  { icon: 'ShoppingBagIcon', label: 'Commandes fournisseurs fictives (notes "demo")' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Icon name={item.icon as any} size={14} className="text-muted-foreground" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <div className="flex gap-2">
                  <Icon name="ShieldCheckIcon" size={15} className="text-green-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700">
                    Les paramètres système, fournisseurs, catégories et vraies données sont préservés.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={runCleanup}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-500 hover:bg-red-700 transition-colors"
                >
                  Lancer le nettoyage
                </button>
              </div>
            </div>
          )}

          {step === 'running' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-500 text-foreground">Nettoyage en cours...</p>
              </div>
              <div className="bg-muted rounded-xl p-4 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
                {log.map((line, i) => (
                  <p key={i} className="text-foreground">{line || '\u00A0'}</p>
                ))}
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex gap-3">
                  <Icon name="CheckCircleIcon" size={20} className="text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-600 text-green-800">Nettoyage terminé</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {[
                        { label: 'Produits supprimés', value: counts.products },
                        { label: 'Clients supprimés', value: counts.clients },
                        { label: 'Tickets supprimés', value: counts.tickets },
                        { label: 'Commandes supprimées', value: counts.orders },
                      ].map((item, i) => (
                        <div key={i} className="text-xs text-green-700">
                          <span className="font-600">{item.value}</span> {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-muted rounded-xl p-3 font-mono text-xs space-y-0.5 max-h-36 overflow-y-auto">
                {log.map((line, i) => (
                  <p key={i} className="text-foreground">{line || '\u00A0'}</p>
                ))}
              </div>
              <button
                onClick={onDone}
                className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Validation helpers ───────────────────────────────────────────────────────

interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
  value: string;
}

function validateRows(rows: ParsedRow[], mapping: ColumnMapping): ValidationError[] {
  let errors: ValidationError[] = [];
  rows.forEach((row, i) => {
    const name = mapping.name ? row[mapping.name] : '';
    const price = mapping.priceTTC ? row[mapping.priceTTC] : '';
    const barcode = mapping.barcode ? row[mapping.barcode] : '';

    if (!name || !name.trim()) {
      errors.push({ rowIndex: i + 1, field: 'Nom', message: 'Nom manquant', value: '' });
    }
    if (price && price.trim()) {
      const cleaned = price.replace(/[€$£\s]/g, '').replace(',', '.');
      if (isNaN(parseFloat(cleaned))) {
        errors.push({ rowIndex: i + 1, field: 'Prix TTC', message: 'Prix invalide', value: price });
      }
    }
    if (barcode && barcode.trim() && barcode.trim().length > 0) {
      const bc = barcode.trim().replace(/\s/g, '');
      if (!/^\d{8,14}$/.test(bc) && bc.length > 0) {
        errors.push({ rowIndex: i + 1, field: 'Code-barres', message: 'Format code-barres inhabituel', value: barcode });
      }
    }
  });
  return errors;
}

// ─── Main Import Page ─────────────────────────────────────────────────────────

type PageStep = 'upload' | 'mapping' | 'preview' | 'summary' | 'importing' | 'done';

export default function ProductImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<PageStep>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ code: '', name: '', priceTTC: '', barcode: '', ref: '', category: '' });
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: number } | null>(null);
  const [showCleanup, setShowCleanup] = useState(false);
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showAllErrors, setShowAllErrors] = useState(false);

  // Load history
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('product_import_history')
      .select('*')
      .order('imported_at', { ascending: false })
      .limit(20);
    if (data) setHistory(data);
    setLoadingHistory(false);
  }, []);

  React.useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

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
        setHeaders(h);
        setRows(r);
        const detected = autoDetectColumns(h);
        setMapping(detected);
        setStep('mapping');
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // Try UTF-8 first; if result contains replacement characters (garbled), retry with Latin-1
    const tryRead = (encoding: string, fallback?: string) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        // Detect garbled encoding: replacement char \uFFFD or common Latin-1 corruption pattern
        const isGarbled = text.includes('\uFFFD') || /[Ã©Ã¨Ã ÃªÃ®Ã´Ã¹Ã»Ã§]/.test(text);
        if (isGarbled && fallback) {
          tryRead(fallback);
          return;
        }
        const { headers: h, rows: r } = parseCSV(text);
        if (h.length === 0) return;
        setHeaders(h);
        setRows(r);
        const detected = autoDetectColumns(h);
        setMapping(detected);
        setStep('mapping');
      };
      reader.readAsText(file, encoding);
    };

    tryRead('UTF-8', 'ISO-8859-1');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    handleFile(file);
  };

  // ── Build summary ──
  const buildSummary = async () => {
    const mapped: MappedProduct[] = rows
      .map((row) => ({
        code: mapping.code ? (row[mapping.code] || '') : '',
        name: mapping.name ? (row[mapping.name] || '') : '',
        priceTTC: mapping.priceTTC ? parsePrice(row[mapping.priceTTC] || '') : 0,
        barcode: mapping.barcode ? (row[mapping.barcode] || '') : '',
        ref: mapping.ref ? (row[mapping.ref] || '') : (mapping.code ? (row[mapping.code] || '') : ''),
        category: mapping.category ? (row[mapping.category] || '') : '',
        rawRow: row,
      }))
      .filter((p) => p.name.trim() !== '');

    // Fetch ALL existing products for dedup check (bypass Supabase 1000-row default)
    const existingProducts = await fetchAll<any>((from, to) =>
      supabase.from('products').select('id, ref, barcode, name').range(from, to)
    );

    const existingByRef: Record<string, any> = {};
    const existingByBarcode: Record<string, any> = {};
    const existingByName: Record<string, any> = {};
    existingProducts.forEach((p: any) => {
      if (p.ref && p.ref.trim()) existingByRef[p.ref.toLowerCase().trim()] = p;
      if (p.barcode && p.barcode.trim()) existingByBarcode[p.barcode.toLowerCase().trim()] = p;
      if (p.name && p.name.trim()) existingByName[p.name.toLowerCase().trim()] = p;
    });

    const seenCodes = new Set<string>();
    const result: ImportSummary = {
      totalDetected: mapped.length,
      toCreate: 0,
      toUpdate: 0,
      duplicates: 0,
      errors: 0,
      barcodesReplaced: 0,
      products: [],
    };

    for (const product of mapped) {
      if (!product.name.trim()) {
        result.errors++;
        result.products.push({ product, action: 'error', errorMsg: 'Nom manquant' });
        continue;
      }

      // Use ref or code as dedup key; fall back to name if both empty
      const codeKey = (product.ref.trim() || product.code.trim() || product.name.trim()).toLowerCase();
      if (seenCodes.has(codeKey)) {
        result.duplicates++;
        result.products.push({ product, action: 'duplicate' });
        continue;
      }
      seenCodes.add(codeKey);

      // Only look up by ref/barcode if they are non-empty
      const existing =
        (product.ref.trim() ? existingByRef[product.ref.toLowerCase().trim()] : null) ||
        (product.code.trim() ? existingByRef[product.code.toLowerCase().trim()] : null) ||
        (product.barcode.trim() ? existingByBarcode[product.barcode.toLowerCase().trim()] : null) ||
        existingByName[product.name.toLowerCase().trim()];

      if (existing) {
        const oldBarcode = existing.barcode;
        const barcodeChanged = product.barcode.trim() && product.barcode !== oldBarcode;
        if (barcodeChanged) result.barcodesReplaced++;
        result.toUpdate++;
        result.products.push({
          product,
          action: 'update',
          existingId: existing.id,
          oldBarcode: barcodeChanged ? oldBarcode : undefined,
        });
      } else {
        result.toCreate++;
        result.products.push({ product, action: 'create' });
      }
    }

    setSummary(result);
    setStep('summary');
  };

  // ── Run import ──
  const runImport = async () => {
    if (!summary) return;
    setStep('importing');
    const log: string[] = [];
    let created = 0;
    let updated = 0;
    let errors = 0;

    const addLog = (msg: string) => {
      log.push(msg);
      setImportLog([...log]);
    };

    // ── Pre-flight column validation ──
    const validatePayload = (
      payload: Record<string, any>,
      rowLabel: string
    ): string | null => {
      if (!payload.name || typeof payload.name !== 'string' || !payload.name.trim()) {
        return `[${rowLabel}] ❌ Colonne "name" nulle ou vide — valeur reçue: ${JSON.stringify(payload.name)}`;
      }
      if (payload.sell_price_ttc !== null && payload.sell_price_ttc !== undefined) {
        if (typeof payload.sell_price_ttc !== 'number' || isNaN(payload.sell_price_ttc)) {
          return `[${rowLabel}] ❌ Colonne "sell_price_ttc" type invalide — valeur reçue: ${JSON.stringify(payload.sell_price_ttc)} (attendu: number)`;
        }
      }
      if (payload.sell_price_ht !== null && payload.sell_price_ht !== undefined) {
        if (typeof payload.sell_price_ht !== 'number' || isNaN(payload.sell_price_ht)) {
          return `[${rowLabel}] ❌ Colonne "sell_price_ht" type invalide — valeur reçue: ${JSON.stringify(payload.sell_price_ht)} (attendu: number)`;
        }
      }
      if (payload.barcode !== null && payload.barcode !== undefined && payload.barcode !== '') {
        if (typeof payload.barcode !== 'string') {
          return `[${rowLabel}] ❌ Colonne "barcode" type invalide — valeur reçue: ${JSON.stringify(payload.barcode)} (attendu: string)`;
        }
        const bc = payload.barcode.trim().replace(/\s/g, '');
        if (bc.length > 0 && !/^\d{8,14}$/.test(bc)) {
          // Warning only — not a hard block
          addLog(`⚠️ [${rowLabel}] Code-barres format inhabituel: "${payload.barcode}" (longueur ${bc.length}, non-numérique ou hors 8-14 chiffres)`);
        }
      }
      if (payload.ref !== null && payload.ref !== undefined && typeof payload.ref !== 'string') {
        return `[${rowLabel}] ❌ Colonne "ref" type invalide — valeur reçue: ${JSON.stringify(payload.ref)} (attendu: string)`;
      }
      return null;
    };

    // ── Helper: insert/upsert one row and return exact DB error ──
    const insertOneRow = async (
      payload: Record<string, any>,
      rowLabel: string,
      mode: 'insert' | 'upsert'
    ): Promise<boolean> => {
      const validationErr = validatePayload(payload, rowLabel);
      if (validationErr) {
        addLog(validationErr);
        console.error('CSV Import row validation failed:', { rowLabel, payload, error: validationErr });
        return false;
      }
      let dbError: any = null;
      if (mode === 'insert') {
        const { error } = await supabase.from('products').insert([payload]);
        dbError = error;
      } else {
        const { error } = await supabase.from('products').upsert([payload], { onConflict: 'id' });
        dbError = error;
      }
      if (dbError) {
        // Classify the error type
        const msg = dbError.message || '';
        const code = dbError.code || '';
        let errorType = 'DB error';
        if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
          errorType = 'Contrainte unicité (doublon)';
        } else if (code === '23502' || msg.includes('null value') || msg.includes('not-null')) {
          errorType = 'Valeur NULL interdite';
        } else if (code === '22P02' || msg.includes('invalid input syntax') || msg.includes('type')) {
          errorType = 'Type de données invalide';
        } else if (code === '23503' || msg.includes('foreign key')) {
          errorType = 'Clé étrangère invalide';
        } else if (code === '42703' || msg.includes('column') || msg.includes('does not exist')) {
          errorType = 'Colonne inconnue';
        }
        addLog(
          `❌ [${rowLabel}] ${errorType} — code: ${code || 'N/A'} — ${msg}` +
          ` | Données: name="${payload.name}" ref="${payload.ref ?? ''}" barcode="${payload.barcode ?? ''}" prix_ttc=${payload.sell_price_ttc}`
        );
        console.error('CSV Import DB row error:', { rowLabel, errorType, code, message: msg, payload });
        return false;
      }
      return true;
    };

    const toCreate = summary.products.filter((i) => i.action === 'create');
    const toUpdate = summary.products.filter((i) => i.action === 'update');
    const total = toCreate.length + toUpdate.length;

    addLog(`📦 Démarrage de l'importation de ${total} produits (${toCreate.length} créations, ${toUpdate.length} mises à jour)...`);
    addLog(`🔍 Validation des colonnes en cours...`);

    // ── Batch INSERT in chunks of 100 ──
    const CHUNK = 100;
    const createPayloads = toCreate.map(({ product }) => ({
      name: product.name,
      ref: product.ref || product.code || null,
      barcode: product.barcode || null,
      sell_price_ttc: product.priceTTC,
      sell_price_ht: product.priceTTC > 0 ? +(product.priceTTC / 1.085).toFixed(4) : 0,
      category: product.category || null,
      status: 'active',
    }));

    for (let i = 0; i < createPayloads.length; i += CHUNK) {
      const chunk = createPayloads.slice(i, i + CHUNK);
      const chunkItems = toCreate.slice(i, i + CHUNK);
      const { error } = await supabase.from('products').insert(chunk);
      if (error) {
        // Batch failed — retry row by row to find exact culprit(s)
        addLog(`⚠️ Lot création ${Math.floor(i / CHUNK) + 1} échoué (${chunk.length} lignes) — analyse ligne par ligne...`);
        console.warn('CSV Import batch insert failed, retrying row-by-row:', error);
        for (let j = 0; j < chunk.length; j++) {
          const rowLabel = `ligne ${i + j + 1} "${chunkItems[j].product.name}"`;
          const ok = await insertOneRow(chunk[j], rowLabel, 'insert');
          if (ok) created++;
          else errors++;
        }
      } else {
        created += chunk.length;
        addLog(`✅ ${Math.min(i + CHUNK, createPayloads.length)}/${createPayloads.length} produits créés...`);
      }
    }

    // ── Batch UPDATE in chunks of 100 using upsert ──
    const updatePayloads = toUpdate
      .filter((item) => item.existingId)
      .map(({ product, existingId }) => ({
        id: existingId!,
        name: product.name,
        ref: product.ref || product.code || null,
        barcode: product.barcode || null,
        sell_price_ttc: product.priceTTC,
        sell_price_ht: product.priceTTC > 0 ? +(product.priceTTC / 1.085).toFixed(4) : 0,
        category: product.category || null,
        status: 'active',
      }));

    const updateItems = toUpdate.filter((item) => item.existingId);

    for (let i = 0; i < updatePayloads.length; i += CHUNK) {
      const chunk = updatePayloads.slice(i, i + CHUNK);
      const chunkItems = updateItems.slice(i, i + CHUNK);
      const { error } = await supabase.from('products').upsert(chunk, { onConflict: 'id' });
      if (error) {
        // Batch failed — retry row by row
        addLog(`⚠️ Lot mise à jour ${Math.floor(i / CHUNK) + 1} échoué (${chunk.length} lignes) — analyse ligne par ligne...`);
        console.warn('CSV Import batch upsert failed, retrying row-by-row:', error);
        for (let j = 0; j < chunk.length; j++) {
          const rowLabel = `ligne ${i + j + 1} "${chunkItems[j].product.name}" (id: ${chunk[j].id})`;
          const ok = await insertOneRow(chunk[j], rowLabel, 'upsert');
          if (ok) updated++;
          else errors++;
        }
      } else {
        updated += chunk.length;
        if (updated % 200 === 0 || i + CHUNK >= updatePayloads.length) {
          addLog(`🔄 ${Math.min(i + CHUNK, updatePayloads.length)}/${updatePayloads.length} produits mis à jour...`);
        }
      }
    }

    addLog('');
    addLog(`✅ Import terminé : ${created} créés, ${updated} mis à jour, ${errors} erreurs`);
    if (errors > 0) {
      addLog(`ℹ️ Consultez les lignes ❌ ci-dessus pour le détail de chaque erreur (contrainte, type, null, colonne inconnue).`);
    }

    // Save history
    await supabase.from('product_import_history').insert({
      file_name: fileName,
      imported_by: 'admin',
      total_detected: summary.totalDetected,
      total_created: created,
      total_updated: updated,
      total_duplicates: summary.duplicates,
      total_errors: errors,
      total_barcodes_replaced: summary.barcodesReplaced,
    });

    setImportResult({ created, updated, errors });

    // Auto-create any new categories detected during import
    const detectedCategories = Array.from(
      new Set(summary.products.map((i) => i.product.category).filter(Boolean))
    );
    if (detectedCategories.length > 0) {
      addLog(`🏷️ Synchronisation des catégories (${detectedCategories.length} détectées)…`);
      for (const catName of detectedCategories) {
        await categoryStore.ensureByName(catName);
      }
      addLog(`✅ Catégories synchronisées`);
    }

    setStep('done');
  };

  const reset = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setSummary(null);
    setImportLog([]);
    setImportResult(null);
    setValidationErrors([]);
    setShowAllErrors(false);
  };

  // ── Go to preview step ──
  const goToPreview = () => {
    let errors = validateRows(rows, mapping);
    setValidationErrors(errors);
    setStep('preview');
  };

  // ── Render ──
  const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
    code: 'Code produit',
    name: 'Libellé / Nom *',
    priceTTC: 'Prix TTC',
    barcode: 'Code-barres',
    ref: 'Référence',
    category: 'Catégorie',
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="bg-white border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/product-management"
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              >
                <Icon name="ArrowLeftIcon" size={18} />
              </Link>
              <div>
                <h1 className="text-lg font-600 text-foreground">Importation produits CSV / Excel</h1>
                <p className="text-xs text-muted-foreground">Importez vos vrais produits depuis votre ancienne caisse</p>
              </div>
            </div>
            <button
              onClick={() => setShowCleanup(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-500 hover:bg-red-50 transition-colors"
            >
              <Icon name="TrashIcon" size={15} />
              Nettoyer données démo
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {(['import', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-500 transition-colors ${
                  activeTab === tab
                    ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:bg-muted'
                }`}
              >
                {tab === 'import' ? 'Importation' : 'Historique'}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 max-w-4xl mx-auto">
          {/* ── History Tab ── */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-600 text-foreground">Historique des importations</h2>
                <button onClick={loadHistory} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                  <Icon name="ArrowPathIcon" size={15} />
                </button>
              </div>
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Icon name="ClockIcon" size={32} className="mb-3 opacity-40" />
                  <p className="text-sm">Aucune importation enregistrée</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {history.map((entry) => (
                    <div key={entry.id} className="px-6 py-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-500 text-foreground">{entry.file_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(entry.imported_at).toLocaleString('fr-FR')} · par {entry.imported_by}
                          </p>
                        </div>
                        <div className="flex gap-4 text-xs text-right">
                          <div>
                            <p className="font-600 text-green-600">{entry.total_created}</p>
                            <p className="text-muted-foreground">créés</p>
                          </div>
                          <div>
                            <p className="font-600 text-blue-600">{entry.total_updated}</p>
                            <p className="text-muted-foreground">mis à jour</p>
                          </div>
                          <div>
                            <p className="font-600 text-amber-600">{entry.total_duplicates}</p>
                            <p className="text-muted-foreground">doublons</p>
                          </div>
                          <div>
                            <p className="font-600 text-red-600">{entry.total_errors}</p>
                            <p className="text-muted-foreground">erreurs</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Import Tab ── */}
          {activeTab === 'import' && (
            <>
              {/* Step indicator */}
              {step !== 'done' && (
                <div className="flex items-center gap-2 mb-6">
                  {(['upload', 'mapping', 'preview', 'summary', 'importing'] as const).map((s, i) => {
                    const steps = ['upload', 'mapping', 'preview', 'summary', 'importing'];
                    const currentIdx = steps.indexOf(step);
                    const thisIdx = steps.indexOf(s);
                    const labels = ['Fichier', 'Colonnes', 'Aperçu', 'Résumé', 'Import'];
                    return (
                      <React.Fragment key={s}>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-600 ${
                              thisIdx < currentIdx
                                ? 'bg-primary text-primary-foreground'
                                : thisIdx === currentIdx
                                ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {thisIdx < currentIdx ? <Icon name="CheckIcon" size={12} /> : i + 1}
                          </div>
                          <span
                            className={`text-xs font-500 ${
                              thisIdx === currentIdx ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {labels[i]}
                          </span>
                        </div>
                        {i < 4 && <div className="flex-1 h-px bg-border" />}
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
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                    }}
                  />
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Icon name="ArrowUpTrayIcon" size={28} className="text-primary" />
                  </div>
                  <h3 className="text-base font-600 text-foreground mb-2">Déposez votre fichier CSV ou Excel ici</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    ou cliquez pour sélectionner le fichier de votre ancienne caisse
                  </p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-500">
                    <Icon name="FolderOpenIcon" size={15} />
                    Choisir un fichier CSV ou Excel
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Formats acceptés : CSV (séparateur ; ou , ou tabulation) · Excel (.xlsx, .xls) · Encodage UTF-8 ou Latin-1
                  </p>
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
                        <p className="text-xs text-muted-foreground">
                          {rows.length} lignes détectées dans <span className="font-500">{fileName}</span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map((field) => (
                        <div key={field}>
                          <label className="block text-xs font-500 text-muted-foreground mb-1.5">
                            {FIELD_LABELS[field]}
                          </label>
                          <select
                            value={mapping[field]}
                            onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            <option value="">— Non mappé —</option>
                            {headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                          {mapping[field] && rows[0] && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              Ex : <span className="font-500 text-foreground">{rows[0][mapping[field]] || '—'}</span>
                            </p>
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
                            {headers.map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-500 text-muted-foreground whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-t border-border">
                              {headers.map((h) => (
                                <td key={h} className="px-3 py-2 text-foreground whitespace-nowrap max-w-[160px] truncate">
                                  {row[h] || '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={reset}
                      className="px-5 py-2.5 rounded-xl border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Changer de fichier
                    </button>
                    <button
                      onClick={goToPreview}
                      disabled={!mapping.name}
                      className="flex-1 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Aperçu avant import →
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step: Preview ── */}
              {step === 'preview' && (
                <div className="space-y-4">
                  {/* Section 1: Detected columns */}
                  <div className="bg-white rounded-2xl border border-border overflow-hidden">
                    <div className="px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Icon name="ViewColumnsIcon" size={16} className="text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-sm font-600 text-foreground">Colonnes détectées</h2>
                        <p className="text-xs text-muted-foreground">{headers.length} colonne(s) dans le fichier · {rows.length} lignes de données</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {headers.map((h) => {
                          const mappedFields = Object.entries(mapping).filter(([, v]) => v === h);
                          const isMapped = mappedFields.length > 0;
                          const fieldLabel = isMapped ? FIELD_LABELS[mappedFields[0][0] as keyof ColumnMapping] : null;
                          return (
                            <div
                              key={h}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-500 ${
                                isMapped
                                  ? 'bg-green-50 border-green-200 text-green-800' :'bg-muted border-border text-muted-foreground'
                              }`}
                            >
                              {isMapped ? (
                                <Icon name="CheckCircleIcon" size={13} className="text-green-600 shrink-0" />
                              ) : (
                                <Icon name="MinusCircleIcon" size={13} className="text-muted-foreground shrink-0" />
                              )}
                              <span>{h}</span>
                              {fieldLabel && (
                                <span className="text-green-600 font-400">→ {fieldLabel.replace(' *', '')}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                        <div className="flex items-center gap-1.5 text-xs text-green-700">
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                          {Object.values(mapping).filter(Boolean).length} mappée(s)
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className="w-2.5 h-2.5 rounded-full bg-border" />
                          {headers.length - Object.values(mapping).filter(Boolean).length} ignorée(s)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Sample rows */}
                  <div className="bg-white rounded-2xl border border-border overflow-hidden">
                    <div className="px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                        <Icon name="TableCellsIcon" size={16} className="text-violet-600" />
                      </div>
                      <div>
                        <h2 className="text-sm font-600 text-foreground">Aperçu des données</h2>
                        <p className="text-xs text-muted-foreground">10 premières lignes du fichier</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="px-3 py-2.5 text-left font-500 text-muted-foreground w-10">#</th>
                            {headers.map((h) => {
                              const mappedFields = Object.entries(mapping).filter(([, v]) => v === h);
                              const isMapped = mappedFields.length > 0;
                              return (
                                <th
                                  key={h}
                                  className={`px-3 py-2.5 text-left font-500 whitespace-nowrap ${
                                    isMapped ? 'text-primary' : 'text-muted-foreground'
                                  }`}
                                >
                                  <div className="flex items-center gap-1">
                                    {isMapped && <Icon name="CheckIcon" size={10} className="text-primary" />}
                                    {h}
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 10).map((row, i) => {
                            const rowErrors = validationErrors.filter((e) => e.rowIndex === i + 1);
                            const hasError = rowErrors.length > 0;
                            return (
                              <tr
                                key={i}
                                className={`border-t border-border ${hasError ? 'bg-red-50/50' : 'hover:bg-muted/20'}`}
                              >
                                <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                                {headers.map((h) => {
                                  const mappedFields = Object.entries(mapping).filter(([, v]) => v === h);
                                  const isMapped = mappedFields.length > 0;
                                  const fieldKey = isMapped ? mappedFields[0][0] : null;
                                  const cellError = fieldKey
                                    ? rowErrors.find((e) => {
                                        const fieldToLabel: Record<string, string> = {
                                          name: 'Nom',
                                          priceTTC: 'Prix TTC',
                                          barcode: 'Code-barres',
                                        };
                                        return e.field === fieldToLabel[fieldKey];
                                      })
                                    : null;
                                  return (
                                    <td
                                      key={h}
                                      className={`px-3 py-2 whitespace-nowrap max-w-[180px] truncate ${
                                        cellError
                                          ? 'text-red-600 font-500'
                                          : isMapped
                                          ? 'text-foreground font-500'
                                          : 'text-muted-foreground'
                                      }`}
                                      title={row[h] || ''}
                                    >
                                      {row[h] || <span className="text-muted-foreground/50 italic">vide</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {rows.length > 10 && (
                      <div className="px-6 py-3 border-t border-border bg-muted/30">
                        <p className="text-xs text-muted-foreground">
                          + {rows.length - 10} ligne(s) supplémentaire(s) non affichées
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Section 3: Validation errors */}
                  {validationErrors.length > 0 ? (
                    <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
                      <div className="px-6 py-4 border-b border-red-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                            <Icon name="ExclamationTriangleIcon" size={16} className="text-red-600" />
                          </div>
                          <div>
                            <h2 className="text-sm font-600 text-foreground">Erreurs de validation</h2>
                            <p className="text-xs text-muted-foreground">
                              {validationErrors.length} problème(s) détecté(s) — les lignes concernées seront ignorées
                            </p>
                          </div>
                        </div>
                        {validationErrors.length > 5 && (
                          <button
                            onClick={() => setShowAllErrors((v) => !v)}
                            className="text-xs text-primary font-500 hover:underline"
                          >
                            {showAllErrors ? 'Réduire' : `Voir tout (${validationErrors.length})`}
                          </button>
                        )}
                      </div>
                      <div className="divide-y divide-red-100">
                        {(showAllErrors ? validationErrors : validationErrors.slice(0, 5)).map((err, i) => (
                          <div key={i} className="px-6 py-3 flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[10px] font-700 text-red-600">{err.rowIndex}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-600 text-red-700">{err.message}</span>
                                <span className="text-xs text-muted-foreground">· champ : {err.field}</span>
                                {err.value && (
                                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-mono truncate max-w-[200px]">
                                    {err.value}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">Ligne {err.rowIndex} du fichier</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {!showAllErrors && validationErrors.length > 5 && (
                        <div className="px-6 py-3 bg-red-50/50 border-t border-red-100">
                          <p className="text-xs text-red-600">
                            {validationErrors.length - 5} autre(s) erreur(s) masquée(s) —{' '}
                            <button onClick={() => setShowAllErrors(true)} className="underline font-500">
                              afficher tout
                            </button>
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-4 flex items-center gap-3">
                      <Icon name="CheckCircleIcon" size={20} className="text-green-600 shrink-0" />
                      <div>
                        <p className="text-sm font-600 text-green-800">Aucune erreur détectée</p>
                        <p className="text-xs text-green-700 mt-0.5">
                          Toutes les {rows.length} lignes semblent valides. Vous pouvez continuer.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep('mapping')}
                      className="px-5 py-2.5 rounded-xl border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      ← Retour
                    </button>
                    <button
                      onClick={buildSummary}
                      className="flex-1 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors"
                    >
                      Analyser et vérifier →
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step: Summary ── */}
              {step === 'summary' && summary && (
                <div className="space-y-4">
                  {/* KPI cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      { label: 'Détectés', value: summary.totalDetected, color: 'bg-blue-50 text-blue-700 border-blue-200' },
                      { label: 'À créer', value: summary.toCreate, color: 'bg-green-50 text-green-700 border-green-200' },
                      { label: 'À mettre à jour', value: summary.toUpdate, color: 'bg-amber-50 text-amber-700 border-amber-200' },
                      { label: 'Doublons', value: summary.duplicates, color: 'bg-orange-50 text-orange-700 border-orange-200' },
                      { label: 'Erreurs', value: summary.errors, color: 'bg-red-50 text-red-700 border-red-200' },
                      { label: 'Codes-barres remplacés', value: summary.barcodesReplaced, color: 'bg-purple-50 text-purple-700 border-purple-200' },
                    ].map((kpi, i) => (
                      <div key={i} className={`rounded-xl border p-3 ${kpi.color}`}>
                        <p className="text-2xl font-700">{kpi.value}</p>
                        <p className="text-xs font-500 mt-0.5 opacity-80">{kpi.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Product list preview */}
                  <div className="bg-white rounded-2xl border border-border overflow-hidden">
                    <div className="px-6 py-3 border-b border-border flex items-center justify-between">
                      <p className="text-sm font-600 text-foreground">Détail des produits</p>
                      <p className="text-xs text-muted-foreground">
                        Affichage des {Math.min(summary.products.length, 50)} premiers
                      </p>
                    </div>
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr>
                            <th className="px-4 py-2 text-left font-500 text-muted-foreground">Action</th>
                            <th className="px-4 py-2 text-left font-500 text-muted-foreground">Nom</th>
                            <th className="px-4 py-2 text-left font-500 text-muted-foreground">Réf / Code</th>
                            <th className="px-4 py-2 text-left font-500 text-muted-foreground">Prix TTC</th>
                            <th className="px-4 py-2 text-left font-500 text-muted-foreground">Code-barres</th>
                            <th className="px-4 py-2 text-left font-500 text-muted-foreground">Catégorie</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.products.slice(0, 50).map((item, i) => {
                            const actionStyles: Record<string, string> = {
                              create: 'bg-green-100 text-green-700',
                              update: 'bg-blue-100 text-blue-700',
                              duplicate: 'bg-orange-100 text-orange-700',
                              error: 'bg-red-100 text-red-700',
                            };
                            const actionLabels: Record<string, string> = {
                              create: 'Créer',
                              update: 'Mettre à jour',
                              duplicate: 'Doublon',
                              error: 'Erreur',
                            };
                            return (
                              <tr key={i} className="border-t border-border hover:bg-muted/30">
                                <td className="px-4 py-2">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-600 ${actionStyles[item.action]}`}>
                                    {actionLabels[item.action]}
                                  </span>
                                </td>
                                <td className="px-4 py-2 font-500 text-foreground max-w-[180px] truncate">
                                  {item.product.name}
                                  {item.errorMsg && (
                                    <span className="text-red-500 ml-1">({item.errorMsg})</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-muted-foreground">{item.product.ref || item.product.code || '—'}</td>
                                <td className="px-4 py-2 text-foreground">
                                  {item.product.priceTTC > 0 ? `${item.product.priceTTC.toFixed(2)} €` : '—'}
                                </td>
                                <td className="px-4 py-2 text-muted-foreground">
                                  {item.product.barcode || '—'}
                                  {item.oldBarcode && (
                                    <span className="text-purple-600 ml-1">(remplace {item.oldBarcode})</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-muted-foreground">{item.product.category || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {summary.errors > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                      <Icon name="ExclamationTriangleIcon" size={16} className="text-red-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">
                        {summary.errors} produit(s) avec erreurs seront ignorés lors de l'importation.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep('mapping')}
                      className="px-5 py-2.5 rounded-xl border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      ← Retour
                    </button>
                    <button
                      onClick={runImport}
                      disabled={summary.toCreate + summary.toUpdate === 0}
                      className="flex-1 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirmer et importer {summary.toCreate + summary.toUpdate} produit(s) →
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
                    {importLog.map((line, i) => (
                      <p key={i} className="text-foreground">{line || '\u00A0'}</p>
                    ))}
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
                  <p className="text-sm text-muted-foreground mb-6">
                    Votre base produits a été mise à jour avec succès.
                  </p>

                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-green-50 rounded-xl p-4">
                      <p className="text-2xl font-700 text-green-700">{importResult.created}</p>
                      <p className="text-xs text-green-600 font-500 mt-1">Produits créés</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4">
                      <p className="text-2xl font-700 text-blue-700">{importResult.updated}</p>
                      <p className="text-xs text-blue-600 font-500 mt-1">Mis à jour</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4">
                      <p className="text-2xl font-700 text-red-700">{importResult.errors}</p>
                      <p className="text-xs text-red-600 font-500 mt-1">Erreurs</p>
                    </div>
                  </div>

                  <div className="bg-muted rounded-xl p-4 font-mono text-xs space-y-0.5 max-h-40 overflow-y-auto text-left mb-6">
                    {importLog.map((line, i) => (
                      <p key={i} className="text-foreground">{line || '\u00A0'}</p>
                    ))}
                  </div>

                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={reset}
                      className="px-5 py-2.5 rounded-xl border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Nouvelle importation
                    </button>
                    <Link
                      href="/product-management"
                      className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors"
                    >
                      Voir les produits →
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showCleanup && (
        <DemoCleanupModal
          onClose={() => setShowCleanup(false)}
          onDone={() => setShowCleanup(false)}
        />
      )}
    </AppLayout>
  );
}
