'use client';

import React, { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import { type Client } from '@/lib/services/clientService';
import { normalizePhone } from '@/lib/utils/phoneUtils';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReassortItem {
  id: string;
  name: string;
  ref?: string;
  imageUrl?: string | null;
  sellPrice: number;
  qty: number;
  isCustom: boolean;
  isBonus: boolean; // true = covered by Budget Pro credit, client does not pay
}

interface SearchProduct {
  id: string;
  name: string;
  ref: string;
  imageUrl: string | null;
  sellPrice: number;
  stock: number;
}

// ── Devis templates ────────────────────────────────────────────────────────────

export interface DevisTemplate {
  id: string;
  name: string;
  emoji: string;
  color: string;
  discountPct: number;
  items: Array<{
    productId: string;
    productRef: string;
    productName: string;
    sellPrice: number;
    qty: number;
    isBonus: boolean;
  }>;
}

const TEMPLATE_LS_KEY = 'beautypos_devis_pro_templates';

function loadTemplates(): DevisTemplate[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(TEMPLATE_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistTemplates(tpls: DevisTemplate[]): void {
  try { localStorage.setItem(TEMPLATE_LS_KEY, JSON.stringify(tpls)); } catch { /* ignore */ }
}

const TEMPLATE_COLOR_OPTIONS = [
  { value: '#B8960C', bg: '#FDF8E7', text: '#8B7009' },
  { value: '#EC4899', bg: '#FDF2F8', text: '#9D174D' },
  { value: '#7C3AED', bg: '#F5F3FF', text: '#5B21B6' },
  { value: '#059669', bg: '#ECFDF5', text: '#065F46' },
  { value: '#2563EB', bg: '#EFF6FF', text: '#1E40AF' },
  { value: '#D97706', bg: '#FFFBEB', text: '#92400E' },
  { value: '#DC2626', bg: '#FEF2F2', text: '#991B1B' },
  { value: '#0891B2', bg: '#ECFEFF', text: '#164E63' },
];

const TEMPLATE_EMOJIS = ['💅', '👁️', '🦶', '✨', '🌸', '💎', '🎁', '🖌️', '🌿', '💋', '🔬', '💼', '🪮', '🧴', '💆', '🧖', '🌺', '⭐'];

const DEFAULT_TEMPLATES: DevisTemplate[] = [
  { id: 'tpl-onglerie', name: 'Onglerie', emoji: '💅', color: '#EC4899', discountPct: 0, items: [] },
  { id: 'tpl-extension-cils', name: 'Extension Cils', emoji: '👁️', color: '#7C3AED', discountPct: 0, items: [] },
  { id: 'tpl-pedicure', name: 'Pédicure', emoji: '🦶', color: '#059669', discountPct: 0, items: [] },
  { id: 'tpl-gel-builder', name: 'Gel Builder', emoji: '🖌️', color: '#2563EB', discountPct: 0, items: [] },
  { id: 'tpl-decouverte', name: 'Pack Découverte', emoji: '🎁', color: '#B8960C', discountPct: 5, items: [] },
];

// ── Brand colors ───────────────────────────────────────────────────────────────
const GOLD  = [184, 150, 12]  as [number, number, number];
const PINK  = [236, 72, 153]  as [number, number, number];
const WHITE = [255, 255, 255] as [number, number, number];
const MUTED = [107, 114, 128] as [number, number, number];
const LGOLD = [253, 248, 231] as [number, number, number]; // light gold bg

// ── Budget PRO tiers ───────────────────────────────────────────────────────────

const BUDGET_PRO_TIERS = [
  { min: 150,  bonus: 15  },
  { min: 200,  bonus: 25  },
  { min: 300,  bonus: 40  },
  { min: 400,  bonus: 55  },
  { min: 500,  bonus: 70  },
  { min: 600,  bonus: 85  },
  { min: 750,  bonus: 110 },
  { min: 1000, bonus: 150 },
  { min: 1250, bonus: 190 },
  { min: 1500, bonus: 225 },
  { min: 2000, bonus: 290 },
  { min: 2500, bonus: 350 },
] as const;

function getTier(total: number) {
  let result: (typeof BUDGET_PRO_TIERS)[number] | null = null;
  for (const t of BUDGET_PRO_TIERS) { if (total >= t.min) result = t; }
  return result;
}

function getNextTier(total: number) {
  for (const t of BUDGET_PRO_TIERS) { if (total < t.min) return t; }
  return null;
}

// ── Image → base64 (via canvas, handles CORS) ──────────────────────────────────

async function imgToBase64(url: string): Promise<string | null> {
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const size = 80;
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('ctx')); return; }
          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('load'));
      img.src = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
      setTimeout(() => reject(new Error('timeout')), 5000);
    });
  } catch { return null; }
}

// ── Upload PDF blob to Supabase storage ────────────────────────────────────────

async function uploadPdf(pdfBytes: Uint8Array, filename: string): Promise<string | null> {
  try {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('filename', filename);
    const res = await fetch('/api/devis-pro/upload', { method: 'POST', body: form });
    if (!res.ok) return null;
    const { url } = await res.json();
    return url ?? null;
  } catch { return null; }
}

// ── Download PDF from bytes ─────────────────────────────────────────────────────

function downloadPdf(pdfBytes: Uint8Array, filename: string) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Devis PDF generation ────────────────────────────────────────────────────────

async function generateDevisPdf(
  client: Client,
  baseItems: ReassortItem[],
  bonusItems: ReassortItem[],
  discountPct: number,
  credit: number,
  freeShipping: boolean,
): Promise<Uint8Array> {
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default || (jsPDFModule as any).jsPDF;
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Pre-load all product images as base64
  const imageMap: Record<string, string> = {};
  await Promise.all([
    ...baseItems.map(async (i) => { if (i.imageUrl) { const b = await imgToBase64(i.imageUrl); if (b) imageMap[i.id] = b; } }),
    ...bonusItems.map(async (i) => { if (i.imageUrl) { const b = await imgToBase64(i.imageUrl); if (b) imageMap[i.id + '-b'] = b; } }),
  ]);

  // Header banner
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFillColor(...PINK);
  doc.rect(0, 35, pageW, 3, 'F');

  // Logo
  try {
    const img = new Image(); img.src = '/assets/images/app_logo.png';
    await new Promise<void>((resolve) => {
      img.onload = () => { try { doc.addImage(img, 'PNG', margin, 8, 18, 18); } catch (_) {} resolve(); };
      img.onerror = () => resolve(); setTimeout(resolve, 800);
    });
  } catch (_) {}

  doc.setTextColor(...WHITE);
  doc.setFontSize(15); doc.setFont('helvetica', 'bold');
  doc.text('MONDE DE L\'ESTHÉTIQUE — Devis PRO', margin + 22, 17);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Cliente : ${client.fullName}`, margin + 22, 24);
  doc.text(`Date : ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin + 22, 30);

  const baseTotal  = baseItems.reduce((s, i) => s + i.sellPrice * i.qty, 0);
  const discountAmount = baseTotal * (discountPct / 100);
  const afterDiscount  = baseTotal - discountAmount;
  const bonusTotal = bonusItems.reduce((s, i) => s + i.sellPrice * i.qty, 0);
  const creditUsed = Math.min(bonusTotal, credit);
  const bonusOverflow = Math.max(0, bonusTotal - credit);
  const clientPays = afterDiscount + bonusOverflow;

  // ── Commande principale table ──────────────────────────────────────────────
  doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Commande principale', margin, 46);

  const hasBaseImg = baseItems.some((i) => imageMap[i.id]);
  autoTable(doc, {
    startY: 49,
    head: [hasBaseImg ? ['', 'Produit', 'Qté', 'Prix unit.', 'Total'] : ['Produit', 'Qté', 'Prix unit.', 'Total']],
    body: baseItems.map((i) => hasBaseImg
      ? ['', i.name + (i.ref ? `\n${i.ref}` : '') + (i.isCustom ? '\n(à sourcer)' : ''), String(i.qty), `${i.sellPrice.toFixed(2)} €`, `${(i.sellPrice * i.qty).toFixed(2)} €`]
      : [i.name + (i.ref ? `\n${i.ref}` : '') + (i.isCustom ? '\n(à sourcer)' : ''), String(i.qty), `${i.sellPrice.toFixed(2)} €`, `${(i.sellPrice * i.qty).toFixed(2)} €`]
    ),
    theme: 'striped',
    headStyles: { fillColor: GOLD, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5, minCellHeight: hasBaseImg ? 14 : 8 },
    columnStyles: hasBaseImg
      ? { 0: { cellWidth: 14 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 26, halign: 'right' }, 4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } }
      : { 0: { cellWidth: 'auto' }, 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 26, halign: 'right' }, 3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } },
    didDrawCell: hasBaseImg ? (data: any) => {
      if (data.section === 'body' && data.column.index === 0) {
        const img = imageMap[baseItems[data.row.index]?.id];
        if (img) { try { doc.addImage(img, 'JPEG', data.cell.x + 1, data.cell.y + 1, 12, 12); } catch (_) {} }
      }
    } : undefined,
  });

  let y = (doc as any).lastAutoTable.finalY + 6;

  // ── Bonus products table ───────────────────────────────────────────────────
  if (bonusItems.length > 0) {
    doc.setFillColor(...PINK); doc.setTextColor(...WHITE); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.roundedRect(margin, y, pageW - margin * 2, 7, 2, 2, 'F');
    doc.text(`✦ Produits Budget Pro — Crédit ${credit} € offert`, margin + 3, y + 5);
    y += 9;

    const hasBonusImg = bonusItems.some((i) => imageMap[i.id + '-b']);
    autoTable(doc, {
      startY: y,
      head: [hasBonusImg ? ['', 'Produit offert', 'Qté', 'Prix unit.', 'Couvert par bonus'] : ['Produit offert', 'Qté', 'Prix unit.', 'Couvert par bonus']],
      body: bonusItems.map((i) => hasBonusImg
        ? ['', i.name + (i.ref ? `\n${i.ref}` : ''), String(i.qty), `${i.sellPrice.toFixed(2)} €`, `${(i.sellPrice * i.qty).toFixed(2)} €`]
        : [i.name + (i.ref ? `\n${i.ref}` : ''), String(i.qty), `${i.sellPrice.toFixed(2)} €`, `${(i.sellPrice * i.qty).toFixed(2)} €`]
      ),
      theme: 'striped',
      headStyles: { fillColor: PINK, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8.5, minCellHeight: hasBonusImg ? 14 : 8 },
      columnStyles: hasBonusImg
        ? { 0: { cellWidth: 14 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 26, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' } }
        : { 0: { cellWidth: 'auto' }, 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 26, halign: 'right' }, 3: { cellWidth: 28, halign: 'right' } },
      didDrawCell: hasBonusImg ? (data: any) => {
        if (data.section === 'body' && data.column.index === 0) {
          const img = imageMap[bonusItems[data.row.index]?.id + '-b'];
          if (img) { try { doc.addImage(img, 'JPEG', data.cell.x + 1, data.cell.y + 1, 12, 12); } catch (_) {} }
        }
      } : undefined,
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const summaryRows: [string, string][] = [['Commande principale', `${baseTotal.toFixed(2)} €`]];
  if (discountPct > 0) summaryRows.push([`Offre commerciale (-${discountPct}%)`, `-${discountAmount.toFixed(2)} €`]);
  if (freeShipping) summaryRows.push(['🚚 Livraison offerte (commande ≥ 150 €)', 'OFFERTE']);
  if (bonusItems.length > 0) {
    summaryRows.push([`Produits Budget Pro ajoutés`, `${bonusTotal.toFixed(2)} €`]);
    summaryRows.push([`✦ Bonus Budget Pro utilisé`, `-${creditUsed.toFixed(2)} €`]);
  }
  summaryRows.push(['TOTAL — VOUS PAYEZ', `${clientPays.toFixed(2)} €`]);
  if (bonusItems.length > 0) summaryRows.push([`Valeur totale des produits emportés`, `${(afterDiscount + bonusTotal).toFixed(2)} €`]);

  autoTable(doc, {
    startY: y, body: summaryRows, theme: 'plain',
    bodyStyles: { fontSize: 10 },
    columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' } },
    didParseCell: (data: any) => {
      if (data.row.raw[0].includes('PAYEZ')) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fontSize = 13; data.cell.styles.fillColor = LGOLD; data.cell.styles.textColor = GOLD; }
      if (data.row.raw[0].includes('Bonus Budget')) { data.cell.styles.textColor = PINK; data.cell.styles.fontStyle = 'bold'; }
      if (data.row.raw[0].includes('Offre')) { data.cell.styles.textColor = [180, 83, 9]; }
      if (data.row.raw[0].includes('Livraison')) { data.cell.styles.textColor = [22, 163, 74]; data.cell.styles.fontStyle = 'bold'; }
    },
  });

  // ── Rules box ──────────────────────────────────────────────────────────────
  const rulesY = (doc as any).lastAutoTable.finalY + 8;
  if (credit > 0) {
    doc.setFillColor(...LGOLD); doc.roundedRect(margin, rulesY, pageW - margin * 2, 16, 3, 3, 'F');
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.5); doc.roundedRect(margin, rulesY, pageW - margin * 2, 16, 3, 3, 'S');
    doc.setTextColor(...GOLD); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text('Règles du Bonus Budget Pro', margin + 4, rulesY + 6);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    doc.text('Valable uniquement sur ce devis · Non cumulable · Non reportable · Non convertible en espèces · À utiliser entièrement sur ce devis.', margin + 4, rulesY + 12, { maxWidth: pageW - margin * 2 - 8 });
  }

  // Footer
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...MUTED);
  doc.text('MONDE DE L\'ESTHÉTIQUE — Martinique · Devis valable 30 jours.', margin, pageH - 8);
  doc.setTextColor(...GOLD);
  doc.text('lmdecaisse.com', pageW - margin, pageH - 8, { align: 'right' });

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}

// ── Concept PDF generation ─────────────────────────────────────────────────────

async function generateConceptPdf(): Promise<Uint8Array> {
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default || (jsPDFModule as any).jsPDF;
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;

  // ── Cover header ────────────────────────────────────────────────────────────
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, pageW, 55, 'F');
  doc.setFillColor(...PINK);
  doc.rect(0, 52, pageW, 3, 'F');

  try {
    const img = new Image(); img.src = '/assets/images/app_logo.png';
    await new Promise<void>((resolve) => {
      img.onload = () => { try { doc.addImage(img, 'PNG', margin, 10, 22, 22); } catch (_) {} resolve(); };
      img.onerror = () => resolve(); setTimeout(resolve, 800);
    });
  } catch (_) {}

  doc.setTextColor(...WHITE);
  doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('MONDE DE L\'ESTHÉTIQUE', margin + 28, 22);
  doc.setFontSize(13); doc.setFont('helvetica', 'normal');
  doc.text('Programme LMDE PRO', margin + 28, 30);
  doc.setFontSize(9); doc.setFont('helvetica', 'italic');
  doc.text('Réservé aux professionnelles de l\'esthétique — Martinique', margin + 28, 38);

  let y = 63;

  // ── Section 1: Programme ───────────────────────────────────────────────────
  doc.setFillColor(...LGOLD);
  doc.roundedRect(margin, y, pageW - margin * 2, 8, 2, 2, 'F');
  doc.setTextColor(...GOLD); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('1.  Votre réassort mensuel simplifié', margin + 4, y + 5.5);
  y += 12;

  doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const text1 = 'Nous mémorisons vos produits habituels. Chaque mois, vous recevez un WhatsApp avec votre liste pré-remplie. Vous confirmez, nous préparons. Plus besoin de ressaisir vos références à chaque commande.';
  const lines1 = doc.splitTextToSize(text1, pageW - margin * 2);
  doc.text(lines1, margin, y);
  y += lines1.length * 5 + 8;

  // ── Section 2: Budget Pro ──────────────────────────────────────────────────
  doc.setFillColor(...LGOLD);
  doc.roundedRect(margin, y, pageW - margin * 2, 8, 2, 2, 'F');
  doc.setTextColor(...GOLD); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('2.  Le Bonus Budget Pro — Repartez avec plus, sans payer plus', margin + 4, y + 5.5);
  y += 12;

  doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const text2 = 'Chaque commande vous donne un crédit en euros à utiliser en produits supplémentaires. Vous payez votre commande habituelle et repartez avec davantage de produits offerts.';
  const lines2 = doc.splitTextToSize(text2, pageW - margin * 2);
  doc.text(lines2, margin, y);
  y += lines2.length * 5 + 6;

  // Tiers table
  autoTable(doc, {
    startY: y,
    head: [['Montant commande', 'Bonus Budget Pro offert', 'Valeur totale emportée', 'Avantage']],
    body: BUDGET_PRO_TIERS.map((t) => [
      `${t.min} €`,
      `+${t.bonus} €`,
      `${t.min + t.bonus} €`,
      `${((t.bonus / t.min) * 100).toFixed(1)} %`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: GOLD, textColor: WHITE, fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 45, halign: 'center' },
      1: { cellWidth: 55, halign: 'center', textColor: PINK as [number, number, number], fontStyle: 'bold' },
      2: { cellWidth: 50, halign: 'center' },
      3: { cellWidth: 30, halign: 'center' },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Section 3: Devis WhatsApp ──────────────────────────────────────────────
  doc.setFillColor(...LGOLD);
  doc.roundedRect(margin, y, pageW - margin * 2, 8, 2, 2, 'F');
  doc.setTextColor(...GOLD); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('3.  Devis instantané envoyé par WhatsApp', margin + 4, y + 5.5);
  y += 12;

  doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const text3 = 'Votre devis personnalisé est prêt en quelques secondes : produits, quantités, bonus Budget Pro appliqué, montant final. Vous recevez un lien PDF directement sur WhatsApp pour consulter et partager votre commande.';
  const lines3 = doc.splitTextToSize(text3, pageW - margin * 2);
  doc.text(lines3, margin, y);
  y += lines3.length * 5 + 8;

  // ── Conditions ─────────────────────────────────────────────────────────────
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(margin, y, pageW - margin * 2, 30, 3, 3, 'F');
  doc.setDrawColor(...PINK); doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, pageW - margin * 2, 30, 3, 3, 'S');
  doc.setTextColor(...PINK); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('Conditions du Bonus Budget Pro', margin + 4, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 40, 40); doc.setFontSize(8.5);
  const conditions = [
    '• Valable uniquement sur le devis concerné — non reportable sur une commande ultérieure',
    '• Non cumulable avec d\'autres avantages ou remises',
    '• Non convertible en espèces ou en avoir',
    '• Le crédit doit être utilisé entièrement sur le devis en cours',
    '• Réservé aux clientes professionnelles enregistrées LMDE Pro',
  ];
  conditions.forEach((line, idx) => { doc.text(line, margin + 4, y + 14 + idx * 4.5); });

  // Footer
  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(...MUTED);
  doc.text('MONDE DE L\'ESTHÉTIQUE · lmdecaisse.com · Martinique', pageW / 2, pageH - 10, { align: 'center' });
  doc.setFillColor(...GOLD); doc.rect(0, pageH - 6, pageW, 6, 'F');

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}

// ── Product search hook ────────────────────────────────────────────────────────

function useProductSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); setShowResults(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(query)}&limit=40`);
        const data = await res.json();
        setResults((data.products ?? []).map((p: any) => ({
          id: p.id, name: p.name, ref: p.ref ?? '',
          imageUrl: p.image_url ?? null,
          sellPrice: Number(p.sell_price_ttc) || 0,
          stock: Number(p.stock) || 0,
        })));
        setShowResults(true);
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const clear = () => { setQuery(''); setResults([]); setShowResults(false); };
  return { query, setQuery, results, searching, showResults, setShowResults, clear };
}

// ── Search box component ───────────────────────────────────────────────────────

function ProductSearchBox({ placeholder, onAdd, variant = 'gold' }: {
  placeholder: string; onAdd: (p: SearchProduct) => void; variant?: 'gold' | 'pink';
}) {
  const { query, setQuery, results, searching, showResults, setShowResults, clear } = useProductSearch();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShowResults(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [setShowResults]);

  const ring = variant === 'pink' ? 'focus-within:ring-pink-300' : 'focus-within:ring-[#B8960C]/40';
  const icon = variant === 'pink' ? 'text-pink-400' : 'text-[#B8960C]';
  const hover = variant === 'pink' ? 'hover:bg-pink-50' : 'hover:bg-[#FDF8E7]';
  const addIcon = variant === 'pink' ? 'text-pink-400' : 'text-[#B8960C]';

  return (
    <div className="relative" ref={ref}>
      <div className={`flex items-center gap-2 px-3 py-2.5 border border-border rounded-lg bg-white focus-within:ring-2 ${ring}`}>
        <Icon name="MagnifyingGlassIcon" size={14} className={`${icon} shrink-0`} />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={placeholder} className="flex-1 text-sm outline-none bg-transparent" />
        {searching && <Icon name="ArrowPathIcon" size={14} className="animate-spin text-muted-foreground shrink-0" />}
      </div>
      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-border rounded-xl shadow-xl max-h-96 overflow-y-auto">
          {results.map((p) => (
            <button key={p.id} onClick={() => { onAdd(p); clear(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 ${hover} transition-colors text-left border-b border-border/40 last:border-0`}>
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon name="PhotoIcon" size={16} className="text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">{p.ref} · {p.sellPrice.toFixed(2)} €{p.stock <= 0 ? ' · ⚠️ Rupture' : ''}</p>
              </div>
              <Icon name="PlusCircleIcon" size={20} className={`${addIcon} shrink-0`} />
            </button>
          ))}
        </div>
      )}
      {showResults && query.length >= 2 && !searching && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-border rounded-xl shadow-xl px-4 py-3 text-center text-sm text-muted-foreground">
          Aucun produit trouvé
        </div>
      )}
    </div>
  );
}

// ── Item list component ────────────────────────────────────────────────────────

function ItemList({ items, onQtyChange, onRemove, variant = 'gold' }: {
  items: ReassortItem[]; onQtyChange: (id: string, d: number) => void; onRemove: (id: string) => void; variant?: 'gold' | 'pink';
}) {
  if (!items.length) return null;
  const btnBg = variant === 'pink' ? 'bg-pink-500' : 'bg-[#B8960C]';
  const priceColor = variant === 'pink' ? 'text-pink-700' : 'text-[#8B7009]';
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id + (item.isBonus ? '-b' : '')} className="flex items-center gap-3 bg-white border border-border rounded-xl p-3">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-border" />
          ) : (
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${item.isCustom ? 'bg-amber-50 border border-amber-200' : 'bg-muted'}`}>
              <Icon name={item.isCustom ? 'MagnifyingGlassIcon' : 'PhotoIcon'} size={18} className={item.isCustom ? 'text-amber-400' : 'text-muted-foreground'} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-600 text-foreground truncate">{item.name}</p>
            <p className="text-[11px] text-muted-foreground">{item.ref && `${item.ref} · `}{item.sellPrice.toFixed(2)} € / unité{item.isCustom && <span className="ml-1 text-amber-600 font-600">· à sourcer</span>}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => onQtyChange(item.id, -1)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground">
              <Icon name="MinusIcon" size={11} />
            </button>
            <span className="w-7 text-center text-sm font-800 tabular-nums">{item.qty}</span>
            <button onClick={() => onQtyChange(item.id, 1)} className={`w-7 h-7 rounded-full ${btnBg} flex items-center justify-center hover:opacity-80 transition-opacity text-white`}>
              <Icon name="PlusIcon" size={11} />
            </button>
          </div>
          <span className={`text-sm font-700 tabular-nums w-18 text-right shrink-0 ${priceColor}`}>{(item.sellPrice * item.qty).toFixed(2)} €</span>
          <button onClick={() => onRemove(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors shrink-0">
            <Icon name="TrashIcon" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ProDevisPanel({ client, onHistoryChanged }: { client: Client; onHistoryChanged?: (history: any[]) => void }) {
  const [items, setItems] = useState<ReassortItem[]>([]);
  const [devisHistory, setDevisHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<DevisTemplate[]>([]);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DevisTemplate | null>(null);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplEmoji, setTplEmoji] = useState('💅');
  const [tplColor, setTplColor] = useState('#B8960C');
  const [tplDiscountPct, setTplDiscountPct] = useState(0);
  const [tplItems, setTplItems] = useState<DevisTemplate['items']>([]);
  const [archiving, setArchiving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showCustomBase, setShowCustomBase] = useState(false);
  const [customBaseName, setCustomBaseName] = useState('');
  const [customBasePrice, setCustomBasePrice] = useState('');
  const [showCustomBonus, setShowCustomBonus] = useState(false);
  const [customBonusName, setCustomBonusName] = useState('');
  const [customBonusPrice, setCustomBonusPrice] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [customDiscountInput, setCustomDiscountInput] = useState('');
  const [showCustomDiscount, setShowCustomDiscount] = useState(false);
  const [showDecouverteModal, setShowDecouverteModal] = useState(false);
  const [showBudgetTable, setShowBudgetTable] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [generatingConcept, setGeneratingConcept] = useState(false);
  const [sendingConcept, setSendingConcept] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${client.id}/pro-profile`)
      .then((r) => r.json())
      .then(({ profile }) => {
        // Prefer Supabase data if migration has been run, else fall back to localStorage
        const lsKey = `beautypos_devis_${client.id}`;
        const lsRaw = typeof window !== 'undefined' ? localStorage.getItem(lsKey) : null;
        const lsData = lsRaw ? JSON.parse(lsRaw) : null;

        const reassort = profile?.produits_reassort ?? lsData?.produits_reassort ?? null;
        const history = profile?.devis_history ?? lsData?.devis_history ?? null;

        if (Array.isArray(reassort)) setItems(reassort.map((i: any) => ({ isBonus: false, ...i })));
        if (Array.isArray(history)) setDevisHistory(history);
      })
      .catch(() => {
        // If Supabase fetch fails, load from localStorage
        const lsKey = `beautypos_devis_${client.id}`;
        const lsRaw = typeof window !== 'undefined' ? localStorage.getItem(lsKey) : null;
        if (lsRaw) {
          const lsData = JSON.parse(lsRaw);
          if (Array.isArray(lsData.produits_reassort)) setItems(lsData.produits_reassort.map((i: any) => ({ isBonus: false, ...i })));
          if (Array.isArray(lsData.devis_history)) setDevisHistory(lsData.devis_history);
        }
      })
      .finally(() => setLoading(false));
  }, [client.id]);

  // Load templates from localStorage (once, client-side only)
  useEffect(() => {
    const stored = loadTemplates();
    // First-time: pre-populate with default starter templates
    if (stored.length === 0) {
      persistTemplates(DEFAULT_TEMPLATES);
      setTemplates(DEFAULT_TEMPLATES);
    } else {
      setTemplates(stored);
    }
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────
  const baseItems = items.filter((i) => !i.isBonus);
  const bonusItems = items.filter((i) => i.isBonus);
  const baseTotal = baseItems.reduce((s, i) => s + i.sellPrice * i.qty, 0);
  const discountAmount = baseTotal * (discountPct / 100);
  const afterDiscount = baseTotal - discountAmount;
  const tier = getTier(afterDiscount);
  const nextTierUp = getNextTier(afterDiscount);
  const credit = tier?.bonus ?? 0;
  const freeShipping = afterDiscount >= 150;
  const bonusTotal = bonusItems.reduce((s, i) => s + i.sellPrice * i.qty, 0);
  const creditUsed = Math.min(bonusTotal, credit);
  const creditRemaining = credit - creditUsed;
  const bonusOverflow = Math.max(0, bonusTotal - credit);
  const clientPays = afterDiscount + bonusOverflow;
  const totalValue = afterDiscount + bonusTotal;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const addToBase = (p: SearchProduct) =>
    setItems((prev) => {
      const ex = prev.find((i) => i.id === p.id && !i.isBonus);
      if (ex) return prev.map((i) => (!i.isBonus && i.id === p.id) ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: p.id, name: p.name, ref: p.ref, imageUrl: p.imageUrl, sellPrice: p.sellPrice, qty: 1, isCustom: false, isBonus: false }];
    });

  const addToBonus = (p: SearchProduct) =>
    setItems((prev) => {
      const ex = prev.find((i) => i.id === p.id && i.isBonus);
      if (ex) return prev.map((i) => (i.isBonus && i.id === p.id) ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: p.id, name: p.name, ref: p.ref, imageUrl: p.imageUrl, sellPrice: p.sellPrice, qty: 1, isCustom: false, isBonus: true }];
    });

  const addCustom = (isBonus: boolean) => {
    const name = isBonus ? customBonusName : customBaseName;
    const priceStr = isBonus ? customBonusPrice : customBasePrice;
    if (!name.trim() || !priceStr) return;
    const price = parseFloat(priceStr.replace(',', '.'));
    if (isNaN(price) || price <= 0) return;
    setItems((prev) => [...prev, { id: `custom-${isBonus ? 'bonus' : 'base'}-${Date.now()}`, name: name.trim(), imageUrl: null, sellPrice: price, qty: 1, isCustom: true, isBonus }]);
    if (isBonus) { setCustomBonusName(''); setCustomBonusPrice(''); setShowCustomBonus(false); }
    else { setCustomBaseName(''); setCustomBasePrice(''); setShowCustomBase(false); }
  };

  const updateQty = (id: string, isBonus: boolean, d: number) =>
    setItems((prev) => prev.map((i) => (i.id === id && i.isBonus === isBonus) ? { ...i, qty: Math.max(1, i.qty + d) } : i));

  const removeItem = (id: string, isBonus: boolean) =>
    setItems((prev) => prev.filter((i) => !(i.id === id && i.isBonus === isBonus)));

  const [migrationNeeded, setMigrationNeeded] = useState(false);

  const lsDevisKey = `beautypos_devis_${client.id}`;

  const persistDevisLocally = (newItems: ReassortItem[], newHistory: any[]) => {
    try {
      localStorage.setItem(lsDevisKey, JSON.stringify({ produits_reassort: newItems, devis_history: newHistory }));
    } catch { /* ignore */ }
  };

  const saveReassort = async () => {
    setSaving(true);
    try {
      // Always save to localStorage first (reliable)
      persistDevisLocally(items, devisHistory);
      // Try Supabase (fails gracefully if columns missing)
      const res = await fetch(`/api/clients/${client.id}/pro-profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ produits_reassort: items }) });
      const json = await res.json().catch(() => ({}));
      if (json.migrationNeeded) setMigrationNeeded(true);
      setSavedOk(true); setTimeout(() => setSavedOk(false), 3000);
    } finally { setSaving(false); }
  };

  const archiveDevis = async () => {
    setArchiving(true);
    try {
      const entry = {
        date: new Date().toISOString().slice(0, 10),
        items,
        discountPct,
        credit,
        clientPays,
        totalValue,
        freeShipping,
      };
      const newHistory = [entry, ...devisHistory];
      // Always save to localStorage first
      persistDevisLocally([], newHistory);
      // Try Supabase
      await fetch(`/api/clients/${client.id}/pro-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produits_reassort: [], devis_history: newHistory }),
      }).catch(() => { /* graceful failure */ });
      setDevisHistory(newHistory);
      onHistoryChanged?.(newHistory);
      setItems([]);
      setDiscountPct(0);
      setShowArchiveConfirm(false);
    } finally { setArchiving(false); }
  };

  // ── Template handlers ──────────────────────────────────────────────────────

  const handleApplyTemplate = async (template: DevisTemplate) => {
    if (template.items.length === 0) {
      import('sonner').then(({ toast }) => toast.info(`Le modèle "${template.name}" est vide — cliquez Modifier pour ajouter des produits`));
      return;
    }
    setApplyingTemplateId(template.id);
    try {
      const productIds = [...new Set(template.items.filter((i) => i.productId).map((i) => i.productId))];
      const priceMap: Record<string, { price: number; imageUrl: string | null }> = {};
      if (productIds.length > 0) {
        const res = await fetch(`/api/products/batch?ids=${productIds.join(',')}`);
        if (res.ok) {
          const data = await res.json();
          (data.products ?? []).forEach((p: any) => {
            priceMap[p.id] = { price: Number(p.sell_price_ttc) || 0, imageUrl: p.image_url ?? null };
          });
        }
      }
      const newItems: ReassortItem[] = template.items.map((ti) => ({
        id: ti.productId || `tpl-${Date.now()}-${Math.random()}`,
        name: ti.productName,
        ref: ti.productRef,
        imageUrl: priceMap[ti.productId]?.imageUrl ?? null,
        sellPrice: priceMap[ti.productId]?.price ?? ti.sellPrice,
        qty: ti.qty,
        isCustom: !ti.productId,
        isBonus: ti.isBonus,
      }));
      setItems(newItems);
      if (template.discountPct > 0) setDiscountPct(template.discountPct);
      const { toast } = await import('sonner');
      toast.success(`Modèle "${template.name}" appliqué — ${newItems.length} produit(s) chargé(s)`);
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTplName('');
    setTplEmoji('💅');
    setTplColor('#B8960C');
    setTplDiscountPct(0);
    setTplItems([]);
    setShowTemplateEditor(true);
  };

  const openEditTemplate = (t: DevisTemplate) => {
    setEditingTemplate(t);
    setTplName(t.name);
    setTplEmoji(t.emoji);
    setTplColor(t.color);
    setTplDiscountPct(t.discountPct);
    setTplItems([...t.items]);
    setShowTemplateEditor(true);
  };

  const handleSaveTemplate = () => {
    if (!tplName.trim()) return;
    if (editingTemplate) {
      const updated = templates.map((t) =>
        t.id === editingTemplate.id
          ? { ...t, name: tplName.trim(), emoji: tplEmoji, color: tplColor, discountPct: tplDiscountPct, items: tplItems }
          : t
      );
      persistTemplates(updated);
      setTemplates(updated);
    } else {
      const newTpl: DevisTemplate = {
        id: `tpl-${Date.now()}`,
        name: tplName.trim(),
        emoji: tplEmoji,
        color: tplColor,
        discountPct: tplDiscountPct,
        items: tplItems,
      };
      const updated = [...templates, newTpl];
      persistTemplates(updated);
      setTemplates(updated);
    }
    setShowTemplateEditor(false);
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    persistTemplates(updated);
    setTemplates(updated);
    if (editingTemplate?.id === id) setShowTemplateEditor(false);
  };

  const addProductToTemplate = (p: SearchProduct) => {
    setTplItems((prev) => {
      const ex = prev.find((i) => i.productId === p.id && !i.isBonus);
      if (ex) return prev.map((i) => (i.productId === p.id && !i.isBonus ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { productId: p.id, productRef: p.ref, productName: p.name, sellPrice: p.sellPrice, qty: 1, isBonus: false }];
    });
  };

  const addBonusProductToTemplate = (p: SearchProduct) => {
    setTplItems((prev) => {
      const ex = prev.find((i) => i.productId === p.id && i.isBonus);
      if (ex) return prev.map((i) => (i.productId === p.id && i.isBonus ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { productId: p.id, productRef: p.ref, productName: p.name, sellPrice: p.sellPrice, qty: 1, isBonus: true }];
    });
  };

  const handleWhatsApp = async () => {
    const phone = normalizePhone(client.whatsapp || client.phone || '');
    if (!phone) { import('sonner').then(({ toast }) => toast.error('Numéro WhatsApp manquant')); return; }
    setSendingWhatsApp(true);
    try {
      const pdfBytes = await generateDevisPdf(client, baseItems, bonusItems, discountPct, credit, freeShipping);
      const slug = client.lastName.toLowerCase().replace(/\s+/g, '-');
      const filename = `devis-lmde-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
      const pdfUrl = await uploadPdf(pdfBytes, filename);
      if (!pdfUrl) {
        const { toast } = await import('sonner');
        toast.warning('Upload PDF échoué — lien absent du message. Vérifiez le bucket Supabase "devis-pro".');
      }

      const baseLines = baseItems.map((i) => `• ${i.name}${i.ref ? ` (${i.ref})` : ''} × ${i.qty} — ${(i.sellPrice * i.qty).toFixed(2)} €`).join('\n');
      const bonusLines = bonusItems.length > 0
        ? `\n\n✨ *Produits offerts (Budget Pro) :*\n${bonusItems.map((i) => `• ${i.name} × ${i.qty} — ${(i.sellPrice * i.qty).toFixed(2)} €`).join('\n')}`
        : '';
      const discLine = discountPct > 0 ? `\n🏷️ Remise commerciale : -${discountPct}% (-${discountAmount.toFixed(2)} €)` : '';
      const shippingLine = freeShipping ? '\n🚚 Livraison offerte ✅' : '';
      const creditLine = credit > 0 ? `\n✨ Bonus Budget Pro : +${credit} € en produits offerts` : '';
      const pdfLine = pdfUrl ? `\n\n📄 *Ton devis complet en PDF :*\n${pdfUrl}` : '';
      const avantageLines = [
        `• Tu es *prioritaire sur le stock* — tes produits sont réservés chaque mois avant tout le monde 🔒`,
        `• Ton réassort est *préparé automatiquement* — plus rien à gérer de ton côté 🙌`,
        freeShipping ? `• *Livraison offerte* 🚚✅` : null,
        `• *Livraison avant la date de ton choix* 📅`,
        credit > 0 ? `• *+${credit} € de produits offerts* grâce au Bonus Budget Pro ✨` : null,
      ].filter(Boolean).join('\n');
      const msg = [
        `Coucou ${client.firstName} 🌸`,
        ``,
        `Voici ton *devis mensuel LMDE PRO* ✨`,
        ``,
        `Ce devis est établi sur la base de tes dépenses habituelles du mois. Tu n'es pas obligée de prendre exactement les mêmes produits — on s'adapte ensemble selon tes besoins. L'essentiel : c'est *100% automatique*, tu n'as plus rien à gérer.`,
        ``,
        `🎯 *Tes avantages en tant que pro LMDE :*`,
        avantageLines,
        ``,
        `📦 *Ta commande :*`,
        baseLines,
        discLine || null,
        shippingLine || null,
        creditLine || null,
        bonusLines || null,
        ``,
        `*💳 Tu paies : ${clientPays.toFixed(2)} €*`,
        bonusItems.length > 0 ? `*🎁 Valeur totale emportée : ${totalValue.toFixed(2)} €*` : null,
        pdfLine || null,
        ``,
        credit > 0 ? `⚠️ _Bonus Budget Pro valable uniquement sur ce devis · non cumulable · non reportable._` : null,
        ``,
        `Tu valides cette commande ou tu veux ajuster quelque chose ? 😊`,
      ].filter((v) => v !== null).join('\n');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    } finally { setSendingWhatsApp(false); }
  };

  const handlePdf = async () => {
    setGeneratingPdf(true);
    try {
      const pdfBytes = await generateDevisPdf(client, baseItems, bonusItems, discountPct, credit, freeShipping);
      const slug = client.lastName.toLowerCase().replace(/\s+/g, '-');
      downloadPdf(pdfBytes, `devis-lmde-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setGeneratingPdf(false); }
  };

  const handleConceptDownload = async () => {
    setGeneratingConcept(true);
    try {
      const pdfBytes = await generateConceptPdf();
      downloadPdf(pdfBytes, 'lmde-pro-programme-budget-pro.pdf');
    } finally { setGeneratingConcept(false); }
  };

  const handleConceptWhatsApp = async () => {
    const phone = normalizePhone(client.whatsapp || client.phone || '');
    if (!phone) { import('sonner').then(({ toast }) => toast.error('Numéro WhatsApp manquant')); return; }
    setSendingConcept(true);
    try {
      const pdfBytes = await generateConceptPdf();
      const pdfUrl = await uploadPdf(pdfBytes, `lmde-pro-concept-${Date.now()}.pdf`);
      const msg = pdfUrl
        ? `Bonjour ${client.firstName} 🌸 Je vous envoie la présentation de notre programme LMDE Pro — Bonus Budget Pro.\n\n📄 Découvrez nos avantages ici :\n${pdfUrl}\n\nN'hésitez pas si vous avez des questions 😊`
        : `Bonjour ${client.firstName} 🌸 Je souhaitais vous présenter notre programme LMDE Pro — Bonus Budget Pro. Contactez-nous pour en savoir plus !`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    } finally { setSendingConcept(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Icon name="ArrowPathIcon" size={22} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6">

      {/* ══ MIGRATION BANNER ═══════════════════════════════════════════════════ */}
      {migrationNeeded && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-700 text-red-800">Migration base de données requise</p>
              <p className="text-xs text-red-600 mt-1">Les colonnes <code className="bg-red-100 px-1 rounded">produits_reassort</code> et <code className="bg-red-100 px-1 rounded">devis_history</code> sont manquantes dans la table.</p>
              <p className="text-xs text-red-600 mt-1">Allez dans <strong>Supabase → SQL Editor</strong> et exécutez :</p>
              <pre className="mt-2 bg-red-900 text-red-100 text-[10px] p-2 rounded-lg overflow-x-auto leading-relaxed">{`ALTER TABLE public.client_pro_profiles
  ADD COLUMN IF NOT EXISTS produits_reassort jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS devis_history     jsonb DEFAULT '[]'::jsonb;`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODÈLES DE DEVIS ═══════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <p className="text-[11px] font-700 uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Icon name="BookmarkIcon" size={12} />Modèles de devis
          </p>
          <button
            onClick={openNewTemplate}
            className="flex items-center gap-1 text-xs font-600 text-[#B8960C] hover:text-[#8B7009] transition-colors"
          >
            <Icon name="PlusIcon" size={12} />Nouveau
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => {
            const colorOpt = TEMPLATE_COLOR_OPTIONS.find((c) => c.value === t.color) ?? TEMPLATE_COLOR_OPTIONS[0];
            const isApplying = applyingTemplateId === t.id;
            return (
              <div key={t.id} className="flex items-center rounded-xl overflow-hidden border" style={{ borderColor: t.color + '40' }}>
                <button
                  onClick={() => handleApplyTemplate(t)}
                  disabled={isApplying}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-700 transition-colors hover:opacity-80 disabled:opacity-60"
                  style={{ background: colorOpt.bg, color: colorOpt.text }}
                  title={t.items.length === 0 ? 'Modèle vide — cliquez Modifier pour configurer' : `Appliquer "${t.name}" (${t.items.length} produit${t.items.length > 1 ? 's' : ''})`}
                >
                  {isApplying
                    ? <Icon name="ArrowPathIcon" size={12} className="animate-spin" />
                    : <span className="text-sm leading-none">{t.emoji}</span>}
                  {t.name}
                  {t.items.length === 0
                    ? <span className="text-[9px] opacity-60">(vide)</span>
                    : <span className="text-[9px] opacity-70">·{t.items.length}</span>}
                </button>
                <button
                  onClick={() => openEditTemplate(t)}
                  className="px-2 py-2 border-l transition-colors hover:bg-black/5"
                  style={{ borderColor: t.color + '30', color: colorOpt.text, background: colorOpt.bg }}
                  title="Modifier ce modèle"
                >
                  <Icon name="PencilIcon" size={11} />
                </button>
              </div>
            );
          })}
          {templates.length === 0 && (
            <button onClick={openNewTemplate} className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-[#B8960C]/30 rounded-xl text-xs text-[#B8960C] font-600 hover:border-[#B8960C]/60 transition-colors w-full justify-center">
              <Icon name="PlusIcon" size={13} />Créer votre premier modèle de devis
            </button>
          )}
        </div>
      </div>

      {/* Template editor modal */}
      {showTemplateEditor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowTemplateEditor(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-border px-5 py-4 flex items-center justify-between">
              <h3 className="font-700 text-foreground">{editingTemplate ? 'Modifier le modèle' : 'Nouveau modèle de devis'}</h3>
              <button onClick={() => setShowTemplateEditor(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <Icon name="XMarkIcon" size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-700 text-muted-foreground uppercase tracking-wide mb-1.5">Nom du modèle</label>
                <input
                  type="text"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  placeholder="Ex : Onglerie, Extension Cils, Pack Découverte…"
                  autoFocus
                  className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#B8960C]/30"
                />
              </div>

              {/* Emoji + Color */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-700 text-muted-foreground uppercase tracking-wide mb-1.5">Emoji</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_EMOJIS.map((e) => (
                      <button key={e} onClick={() => setTplEmoji(e)}
                        className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all ${tplEmoji === e ? 'ring-2 ring-[#B8960C] bg-[#FDF8E7] scale-110' : 'hover:bg-muted'}`}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-700 text-muted-foreground uppercase tracking-wide mb-1.5">Couleur</label>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATE_COLOR_OPTIONS.map((c) => (
                      <button key={c.value} onClick={() => setTplColor(c.value)}
                        className={`w-7 h-7 rounded-full transition-all ${tplColor === c.value ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                        style={{ background: c.value }}
                        title={c.value}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Discount */}
              <div>
                <label className="block text-xs font-700 text-muted-foreground uppercase tracking-wide mb-1.5">Remise automatique</label>
                <div className="flex flex-wrap gap-2">
                  {[0, 5, 10, 15].map((pct) => (
                    <button key={pct} onClick={() => setTplDiscountPct(pct)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-700 border transition-colors ${tplDiscountPct === pct ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-muted-foreground hover:border-amber-300'}`}>
                      {pct === 0 ? 'Aucune' : `-${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products — base */}
              <div>
                <label className="block text-xs font-700 text-muted-foreground uppercase tracking-wide mb-1.5">
                  Produits du modèle
                  <span className="ml-2 normal-case font-500 text-[10px]">({tplItems.filter(i => !i.isBonus).length} produit{tplItems.filter(i => !i.isBonus).length > 1 ? 's' : ''} · {tplItems.filter(i => i.isBonus).length} offert{tplItems.filter(i => i.isBonus).length > 1 ? 's' : ''})</span>
                </label>
                <ProductSearchBox placeholder="Rechercher un produit à ajouter…" onAdd={addProductToTemplate} variant="gold" />
                {tplItems.filter((i) => !i.isBonus).length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {tplItems.filter((i) => !i.isBonus).map((ti, idx) => (
                      <div key={`${ti.productId}-${idx}`} className="flex items-center gap-2 bg-[#FDF8E7] rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-600 truncate">{ti.productName}</p>
                          <p className="text-[10px] text-muted-foreground">{ti.productRef} · {ti.sellPrice.toFixed(2)} €</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setTplItems((prev) => prev.map((t, i) => (i === prev.findIndex(x => x.productId === ti.productId && !x.isBonus) && !t.isBonus) ? { ...t, qty: Math.max(1, t.qty - 1) } : t))}
                            className="w-6 h-6 rounded border border-border flex items-center justify-center text-xs hover:bg-muted">−</button>
                          <span className="w-5 text-center text-xs font-700">{ti.qty}</span>
                          <button onClick={() => setTplItems((prev) => prev.map((t, i) => (i === prev.findIndex(x => x.productId === ti.productId && !x.isBonus) && !t.isBonus) ? { ...t, qty: t.qty + 1 } : t))}
                            className="w-6 h-6 rounded border border-border flex items-center justify-center text-xs hover:bg-muted">+</button>
                          <button onClick={() => setTplItems((prev) => { const idx = prev.findIndex(x => x.productId === ti.productId && !x.isBonus); return prev.filter((_, i) => i !== idx); })}
                            className="w-6 h-6 rounded border border-border flex items-center justify-center text-red-500 hover:bg-red-50 ml-0.5">
                            <Icon name="XMarkIcon" size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Products — bonus (Budget Pro) */}
              <div>
                <label className="block text-xs font-700 text-pink-600 uppercase tracking-wide mb-1.5">✨ Produits offerts (Budget Pro)</label>
                <ProductSearchBox placeholder="Produits à inclure en bonus…" onAdd={addBonusProductToTemplate} variant="pink" />
                {tplItems.filter((i) => i.isBonus).length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {tplItems.filter((i) => i.isBonus).map((ti, idx) => (
                      <div key={`bonus-${ti.productId}-${idx}`} className="flex items-center gap-2 bg-pink-50 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-600 truncate text-pink-800">{ti.productName} <span className="text-[9px] bg-pink-200 text-pink-700 px-1 rounded font-700">OFFERT</span></p>
                          <p className="text-[10px] text-pink-500">{ti.productRef} · {ti.sellPrice.toFixed(2)} €</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setTplItems((prev) => prev.map((t, i) => (i === prev.findIndex(x => x.productId === ti.productId && x.isBonus) && t.isBonus) ? { ...t, qty: Math.max(1, t.qty - 1) } : t))}
                            className="w-6 h-6 rounded border border-pink-200 flex items-center justify-center text-xs hover:bg-pink-100">−</button>
                          <span className="w-5 text-center text-xs font-700 text-pink-700">{ti.qty}</span>
                          <button onClick={() => setTplItems((prev) => prev.map((t, i) => (i === prev.findIndex(x => x.productId === ti.productId && x.isBonus) && t.isBonus) ? { ...t, qty: t.qty + 1 } : t))}
                            className="w-6 h-6 rounded border border-pink-200 flex items-center justify-center text-xs hover:bg-pink-100">+</button>
                          <button onClick={() => setTplItems((prev) => { const idx = prev.findIndex(x => x.productId === ti.productId && x.isBonus); return prev.filter((_, i) => i !== idx); })}
                            className="w-6 h-6 rounded border border-pink-200 flex items-center justify-center text-red-400 hover:bg-red-50 ml-0.5">
                            <Icon name="XMarkIcon" size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-border px-5 py-4 flex gap-3">
              <button
                onClick={handleSaveTemplate}
                disabled={!tplName.trim()}
                className="flex-1 py-2.5 bg-[#B8960C] text-white rounded-xl text-sm font-700 hover:bg-[#8B7009] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                <Icon name="CheckIcon" size={14} />
                {editingTemplate ? 'Enregistrer les modifications' : 'Créer le modèle'}
              </button>
              {editingTemplate && (
                <button
                  onClick={() => { if (window.confirm(`Supprimer le modèle "${editingTemplate.name}" ?`)) handleDeleteTemplate(editingTemplate.id); }}
                  className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-600 hover:bg-red-50 transition-colors"
                >
                  <Icon name="TrashIcon" size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ COMMANDE PRINCIPALE ══════════════════════════════════════════════════ */}
      <div className="border border-[#B8960C]/30 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-[#FDF8E7] border-b border-[#B8960C]/20 flex items-center justify-between">
          <h3 className="text-xs font-700 uppercase tracking-wide text-[#8B7009] flex items-center gap-1.5">
            <Icon name="ShoppingBagIcon" size={13} />Commande principale — client paie ce montant
          </h3>
          {baseItems.length > 0 && <span className="text-sm font-800 tabular-nums text-[#8B7009]">{baseTotal.toFixed(2)} €</span>}
        </div>
        <div className="p-4 space-y-3">
          <ProductSearchBox placeholder="Rechercher un produit à ajouter à la commande…" onAdd={addToBase} variant="gold" />
          {!showCustomBase ? (
            <button onClick={() => setShowCustomBase(true)} className="flex items-center gap-1.5 text-xs font-600 text-[#B8960C] hover:text-[#8B7009]">
              <Icon name="PlusIcon" size={12} />Ajouter un produit hors-stock / à sourcer
            </button>
          ) : (
            <div className="border border-[#B8960C]/20 rounded-lg p-3 bg-white space-y-2">
              <p className="text-xs font-700 text-[#B8960C]">Produit hors-stock (à sourcer)</p>
              <div className="flex gap-2">
                <input type="text" value={customBaseName} onChange={(e) => setCustomBaseName(e.target.value)} placeholder="Nom" className="flex-1 px-2.5 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#B8960C]/40" />
                <input type="number" value={customBasePrice} onChange={(e) => setCustomBasePrice(e.target.value)} placeholder="Prix €" min="0" step="0.01" className="w-24 px-2.5 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#B8960C]/40" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => addCustom(false)} disabled={!customBaseName.trim() || !customBasePrice} className="flex-1 py-1.5 bg-[#B8960C] text-white rounded-lg text-xs font-700 disabled:opacity-40">Ajouter</button>
                <button onClick={() => { setShowCustomBase(false); setCustomBaseName(''); setCustomBasePrice(''); }} className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground">Annuler</button>
              </div>
            </div>
          )}
          {baseItems.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center border-2 border-dashed border-[#B8960C]/20 rounded-xl">
              <Icon name="ShoppingBagIcon" size={28} className="text-[#B8960C]/30 mb-2" />
              <p className="text-xs text-muted-foreground">Aucun produit dans la commande principale</p>
            </div>
          ) : (
            <ItemList items={baseItems} onQtyChange={(id, d) => updateQty(id, false, d)} onRemove={(id) => removeItem(id, false)} variant="gold" />
          )}
          {/* Shipping badge */}
          {baseItems.length > 0 && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-600 transition-all ${freeShipping ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-muted/40 text-muted-foreground border border-border'}`}>
              <span className="text-base">🚚</span>
              {freeShipping
                ? <span>Livraison <strong>offerte</strong> — commande ≥ 150 € ✓</span>
                : <span>Livraison offerte à partir de 150 € — encore <strong>{(150 - afterDiscount).toFixed(2)} €</strong></span>
              }
            </div>
          )}
        </div>
      </div>

      {/* ══ OFFRE COMMERCIALE ════════════════════════════════════════════════════ */}
      {baseItems.length > 0 && (
        <div className="border border-amber-100 rounded-xl p-4 bg-amber-50/30 space-y-3">
          <h3 className="text-xs font-700 uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
            <Icon name="TagIcon" size={13} />Offre commerciale
          </h3>
          <div className="flex flex-wrap gap-2">
            {[0, 5, 10, 15].map((pct) => (
              <button key={pct} onClick={() => { setDiscountPct(pct); setShowCustomDiscount(false); setCustomDiscountInput(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-700 border transition-colors ${discountPct === pct && !showCustomDiscount ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-muted-foreground hover:border-amber-300'}`}>
                {pct === 0 ? 'Aucune' : `-${pct}%`}
              </button>
            ))}
            <button onClick={() => setShowCustomDiscount(!showCustomDiscount)}
              className={`px-3 py-1.5 rounded-lg text-xs font-700 border transition-colors ${showCustomDiscount ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-muted-foreground hover:border-amber-300'}`}>
              Autre %
            </button>
          </div>
          {showCustomDiscount && (
            <div className="flex items-center gap-2">
              <input type="number" value={customDiscountInput} onChange={(e) => setCustomDiscountInput(e.target.value)} placeholder="Ex: 7" min="0" max="100" className="w-24 px-2.5 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              <span className="text-sm text-muted-foreground">%</span>
              <button onClick={() => { const v = parseFloat(customDiscountInput); if (!isNaN(v) && v >= 0 && v <= 100) setDiscountPct(v); }} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-700">Appliquer</button>
            </div>
          )}
          {discountPct > 0 && <p className="text-xs text-amber-600 font-600">-{discountPct}% = -{discountAmount.toFixed(2)} € · Commande après offre : {afterDiscount.toFixed(2)} €</p>}
        </div>
      )}

      {/* ══ BUDGET PRO ══════════════════════════════════════════════════════════ */}
      {baseItems.length > 0 && (
        <div className="border-2 border-[#B8960C]/30 rounded-xl overflow-hidden">

          {/* Credit header gradient gold → pink */}
          <div className="bg-gradient-to-r from-[#B8960C] to-[#EC4899] p-5 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-700 uppercase tracking-widest opacity-75">Bonus Budget Pro — Produits offerts</p>
                {tier ? (
                  <>
                    <p className="text-5xl font-900 mt-1 tabular-nums">+{credit} €</p>
                    <p className="text-xs opacity-75 mt-1">palier {tier.min} € atteint ✓ — ajoutez des produits supplémentaires gratuitement</p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-700 mt-2 opacity-60">Pas encore qualifié</p>
                    <p className="text-xs opacity-75 mt-1">{nextTierUp ? `Encore ${(nextTierUp.min - afterDiscount).toFixed(2)} € pour +${nextTierUp.bonus} € de produits offerts` : 'Commande minimum : 150 €'}</p>
                  </>
                )}
              </div>
              <div className="bg-white/20 rounded-xl p-3"><Icon name="GiftIcon" size={32} className="opacity-90" /></div>
            </div>
            {tier && nextTierUp && (
              <div className="mt-3">
                <div className="flex justify-between text-[10px] opacity-60 mb-1">
                  <span>{tier.min} €</span><span>Prochain : {nextTierUp.min} € → +{nextTierUp.bonus} €</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full transition-all" style={{ width: `${Math.min(100, ((afterDiscount - tier.min) / (nextTierUp.min - tier.min)) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Credit tracker */}
          {credit > 0 && (
            <div className="bg-pink-50 px-5 py-3 border-b border-pink-100">
              <div className="flex justify-between mb-1.5">
                <span className="text-xs font-700 text-pink-700">Bonus utilisé en produits</span>
                <span className="text-xs font-700 text-pink-700 tabular-nums">{creditUsed.toFixed(2)} € / {credit} €</span>
              </div>
              <div className="h-3 bg-pink-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${creditRemaining === 0 ? 'bg-emerald-500' : 'bg-pink-500'}`}
                  style={{ width: `${Math.min(100, (creditUsed / credit) * 100)}%` }} />
              </div>
              <p className="text-[10px] text-pink-500 mt-1">
                {creditRemaining > 0 ? `Il reste ${creditRemaining.toFixed(2)} € de bonus à utiliser en produits` : '✓ Bonus entièrement utilisé'}
              </p>
            </div>
          )}

          {/* Bonus products zone */}
          {credit > 0 && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-700 uppercase tracking-wide text-pink-700 flex items-center gap-1.5">
                  <Icon name="GiftIcon" size={13} />Produits ajoutés avec le bonus
                </h3>
                {bonusItems.length > 0 && <span className="text-xs font-700 text-pink-600 tabular-nums">{bonusTotal.toFixed(2)} € / {credit} €</span>}
              </div>
              {creditRemaining > 0 && (
                <ProductSearchBox
                  placeholder={`Ajouter jusqu'à ${creditRemaining.toFixed(2)} € de produits offerts…`}
                  onAdd={addToBonus}
                  variant="pink"
                />
              )}
              {creditRemaining > 0 && !showCustomBonus && (
                <button onClick={() => setShowCustomBonus(true)} className="flex items-center gap-1.5 text-xs font-600 text-pink-600 hover:text-pink-800">
                  <Icon name="PlusIcon" size={12} />Ajouter un produit hors-stock avec le crédit
                </button>
              )}
              {showCustomBonus && (
                <div className="border border-pink-200 rounded-lg p-3 bg-white space-y-2">
                  <p className="text-xs font-700 text-pink-700">Produit hors-stock (bonus Budget Pro)</p>
                  <div className="flex gap-2">
                    <input type="text" value={customBonusName} onChange={(e) => setCustomBonusName(e.target.value)} placeholder="Nom" className="flex-1 px-2.5 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
                    <input type="number" value={customBonusPrice} onChange={(e) => setCustomBonusPrice(e.target.value)} placeholder="Prix €" min="0" step="0.01" className="w-24 px-2.5 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => addCustom(true)} disabled={!customBonusName.trim() || !customBonusPrice} className="flex-1 py-1.5 bg-pink-500 text-white rounded-lg text-xs font-700 disabled:opacity-40">Ajouter</button>
                    <button onClick={() => { setShowCustomBonus(false); setCustomBonusName(''); setCustomBonusPrice(''); }} className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground">Annuler</button>
                  </div>
                </div>
              )}
              {bonusItems.length === 0 ? (
                <div className="flex flex-col items-center py-5 text-center border-2 border-dashed border-pink-200 rounded-xl">
                  <Icon name="GiftIcon" size={24} className="text-pink-300 mb-1.5" />
                  <p className="text-xs font-700 text-pink-600">Vous avez {credit} € de bonus à utiliser !</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Recherchez des produits ci-dessus — ils seront offerts</p>
                </div>
              ) : (
                <>
                  <ItemList items={bonusItems} onQtyChange={(id, d) => updateQty(id, true, d)} onRemove={(id) => removeItem(id, true)} variant="pink" />
                  {bonusOverflow > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs text-amber-700 font-700">⚠️ Dépassement de {bonusOverflow.toFixed(2)} € au-delà du crédit — ce montant sera ajouté à la facture</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Summary totals */}
          <div className="bg-white border-t border-[#B8960C]/10 p-4 space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Commande principale</span><span className="tabular-nums font-600">{baseTotal.toFixed(2)} €</span>
            </div>
            {discountPct > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-600">Offre commerciale -{discountPct}%</span>
                <span className="tabular-nums font-600 text-amber-600">-{discountAmount.toFixed(2)} €</span>
              </div>
            )}
            {freeShipping && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-700 font-600 flex items-center gap-1">🚚 Livraison offerte</span>
                <span className="font-700 text-emerald-600">OFFERTE</span>
              </div>
            )}
            {bonusItems.length > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-pink-600">Produits Budget Pro ajoutés</span>
                  <span className="tabular-nums font-600 text-pink-600">+{bonusTotal.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-pink-700 font-700">✨ Bonus Budget Pro appliqué</span>
                  <span className="tabular-nums font-800 text-pink-700">-{creditUsed.toFixed(2)} €</span>
                </div>
              </>
            )}
            <div className="border-t border-border pt-2 flex justify-between items-baseline">
              <span className="text-base font-700 text-foreground">Vous payez</span>
              <span className="text-2xl font-900 tabular-nums text-[#B8960C]">{clientPays.toFixed(2)} €</span>
            </div>
            {bonusItems.length > 0 && (
              <div className="flex justify-between text-xs text-pink-600 font-600">
                <span>Valeur totale des produits emportés</span>
                <span className="tabular-nums">{totalValue.toFixed(2)} €</span>
              </div>
            )}
          </div>

          {credit > 0 && (
            <div className="bg-[#FDF8E7] border-t border-[#B8960C]/15 px-4 py-2.5">
              <p className="text-[10px] text-[#8B7009] leading-relaxed">⚠️ Crédit valable uniquement sur ce devis · Non cumulable · Non reportable · Non convertible en espèces · À utiliser entièrement sur ce devis</p>
            </div>
          )}
        </div>
      )}

      {/* Budget PRO full table toggle */}
      {baseItems.length > 0 && (
        <>
          <button onClick={() => setShowBudgetTable(!showBudgetTable)}
            className="w-full flex items-center justify-between text-xs font-600 text-[#B8960C] hover:text-[#8B7009] py-1">
            <span>Voir tous les paliers Budget Pro</span>
            <Icon name={showBudgetTable ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={14} />
          </button>
          {showBudgetTable && (
            <div className="border border-[#B8960C]/20 rounded-xl overflow-hidden">
              <div className="bg-[#B8960C] px-3 py-2 grid grid-cols-4 text-[10px] font-700 text-white uppercase tracking-wide">
                <span>Commande</span><span className="text-right">Crédit</span><span className="text-right">Total produits</span><span className="text-right">%</span>
              </div>
              {BUDGET_PRO_TIERS.map((t, i) => {
                const isCurrent = tier?.min === t.min;
                const isNext = nextTierUp?.min === t.min;
                return (
                  <div key={t.min} className={`px-3 py-2 grid grid-cols-4 text-xs border-b border-[#B8960C]/10 last:border-0 ${isCurrent ? 'bg-pink-50 font-700' : isNext ? 'bg-[#FDF8E7]/60' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <span className={isCurrent ? 'text-pink-700' : isNext ? 'text-[#B8960C] font-600' : ''}>{t.min} €{isCurrent ? ' ✓' : ''}</span>
                    <span className={`text-right ${isCurrent ? 'text-pink-700' : 'text-[#B8960C]'}`}>+{t.bonus} €</span>
                    <span className={`text-right tabular-nums ${isCurrent ? 'text-pink-700' : ''}`}>{t.min + t.bonus} €</span>
                    <span className={`text-right ${isCurrent ? 'text-pink-700' : 'text-muted-foreground'}`}>{((t.bonus / t.min) * 100).toFixed(1)}%</span>
                  </div>
                );
              })}
              <div className="bg-[#FDF8E7] px-3 py-2"><p className="text-[10px] text-[#8B7009]">Crédit valable uniquement sur le devis concerné · Non cumulable · Non reportable · Non convertible</p></div>
            </div>
          )}
        </>
      )}

      {/* ── ACTIONS ──────────────────────────────────────────────────────────────── */}
      <div className="space-y-3 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={saveReassort} disabled={saving}
            className="py-3 bg-[#B8960C] text-white rounded-xl text-sm font-700 hover:bg-[#8B7009] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <><Icon name="ArrowPathIcon" size={13} className="animate-spin" />Enregistrement…</>
              : savedOk ? <><Icon name="CheckIcon" size={13} />Enregistré !</>
              : <><Icon name="BookmarkIcon" size={13} />Sauvegarder brouillon</>}
          </button>
          {items.length > 0 && (
            <button onClick={() => setShowArchiveConfirm(true)} disabled={archiving}
              className="py-3 bg-emerald-600 text-white rounded-xl text-sm font-700 hover:bg-emerald-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              <Icon name="ArchiveBoxIcon" size={13} />Archiver &amp; nouveau
            </button>
          )}
        </div>
        {baseItems.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleWhatsApp} disabled={sendingWhatsApp}
              className="flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-xl text-sm font-700 hover:bg-green-600 transition-colors disabled:opacity-50">
              {sendingWhatsApp ? <Icon name="ArrowPathIcon" size={16} className="animate-spin" /> : <Icon name="ChatBubbleLeftRightIcon" size={16} />}
              {sendingWhatsApp ? 'Génération…' : 'WhatsApp + PDF'}
            </button>
            <button onClick={handlePdf} disabled={generatingPdf}
              className="flex items-center justify-center gap-2 py-3 bg-[#EC4899] text-white rounded-xl text-sm font-700 hover:bg-pink-600 transition-colors disabled:opacity-50">
              {generatingPdf ? <Icon name="ArrowPathIcon" size={16} className="animate-spin" /> : <Icon name="DocumentArrowDownIcon" size={16} />}
              {generatingPdf ? 'Génération…' : 'Télécharger PDF'}
            </button>
          </div>
        )}
        <button onClick={() => setShowDecouverteModal(true)}
          className="w-full py-2.5 border-2 border-[#B8960C]/30 text-[#B8960C] rounded-xl text-sm font-700 hover:bg-[#FDF8E7] transition-colors flex items-center justify-center gap-2">
          <Icon name="SparklesIcon" size={15} />Présenter le concept LMDE Pro à la cliente
        </button>
      </div>

      {/* ── HISTORIQUE DES DEVIS ARCHIVÉS ────────────────────────────────────────── */}
      {devisHistory.length > 0 && (
        <div className="border border-[#B8960C]/20 rounded-xl overflow-hidden">
          <div className="bg-[#FDF8E7] px-4 py-3 border-b border-[#B8960C]/15 flex items-center justify-between">
            <h3 className="text-xs font-700 uppercase tracking-wide text-[#8B7009] flex items-center gap-1.5">
              <Icon name="ClockIcon" size={13} />Historique des devis archivés
            </h3>
            <span className="text-[10px] text-muted-foreground">{devisHistory.length} devis</span>
          </div>
          <div className="divide-y divide-border">
            {devisHistory.map((d: any, i: number) => (
              <div key={i} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-700 text-foreground">
                      {d.date ? new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : `Devis #${devisHistory.length - i}`}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {(d.items ?? []).filter((it: any) => !it.isBonus).length} produit(s)
                      {(d.items ?? []).filter((it: any) => it.isBonus).length > 0 && ` · ${(d.items ?? []).filter((it: any) => it.isBonus).length} offert(s)`}
                      {d.discountPct > 0 && ` · -${d.discountPct}%`}
                      {d.freeShipping && ` · 🚚 livraison offerte`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-800 tabular-nums text-[#B8960C]">{Number(d.clientPays ?? 0).toFixed(2)} €</span>
                    {d.totalValue > d.clientPays && (
                      <span className="text-[10px] text-pink-600 font-600">val. {Number(d.totalValue ?? 0).toFixed(2)} €</span>
                    )}
                    <button
                      onClick={() => {
                        if (items.length > 0 && !confirm('Remplacer le devis actuel par cet ancien devis ?')) return;
                        setItems((d.items ?? []).map((it: any) => ({ ...it })));
                        setDiscountPct(d.discountPct ?? 0);
                      }}
                      className="px-2.5 py-1 bg-[#FDF8E7] border border-[#B8960C]/30 text-[#8B7009] rounded-lg text-[10px] font-700 hover:bg-[#B8960C] hover:text-white transition-colors"
                    >
                      Recharger
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ARCHIVE CONFIRM MODAL ────────────────────────────────────────────────── */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowArchiveConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                <Icon name="ArchiveBoxIcon" size={20} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-700">Archiver ce devis ?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Le devis sera sauvegardé dans l&apos;historique (Fiche Pro) et le panneau sera réinitialisé pour le mois suivant.</p>
              </div>
            </div>
            <div className="bg-[#FDF8E7] border border-[#B8960C]/20 rounded-xl p-3 text-xs text-[#8B7009] space-y-0.5">
              <p><strong>{baseItems.length}</strong> produit(s) principal · {bonusItems.length > 0 ? <><strong>{bonusItems.length}</strong> offert(s)</> : 'pas de bonus'}</p>
              <p>Montant payé : <strong>{clientPays.toFixed(2)} €</strong>{bonusItems.length > 0 ? ` · Valeur totale : ${totalValue.toFixed(2)} €` : ''}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowArchiveConfirm(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted/30">Annuler</button>
              <button onClick={archiveDevis} disabled={archiving} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-700 hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {archiving ? <><Icon name="ArrowPathIcon" size={13} className="animate-spin" />Archivage…</> : <><Icon name="ArchiveBoxIcon" size={13} />Archiver</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DÉCOUVERTE MODAL ─────────────────────────────────────────────────────── */}
      {showDecouverteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDecouverteModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="bg-gradient-to-br from-[#B8960C] to-[#EC4899] p-6 rounded-t-2xl text-white">
              <div className="flex items-start gap-3">
                <Icon name="SparklesIcon" size={28} className="mt-0.5 opacity-90" />
                <div>
                  <h2 className="text-xl font-800">MONDE DE L'ESTHÉTIQUE</h2>
                  <p className="text-sm opacity-80 mt-0.5">Programme LMDE Pro — Budget Pro</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {/* Step 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#FDF8E7] text-[#B8960C] text-sm font-800 flex items-center justify-center shrink-0 border border-[#B8960C]/20">1</div>
                  <h3 className="text-sm font-700">Votre réassort simplifié, chaque mois</h3>
                </div>
                <p className="text-sm text-muted-foreground pl-11">Nous gardons en mémoire vos produits habituels. Chaque mois, on vous envoie un WhatsApp avec votre liste pré-remplie. Vous confirmez, on prépare.</p>
              </div>
              {/* Step 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-pink-50 text-pink-600 text-sm font-800 flex items-center justify-center shrink-0 border border-pink-200">2</div>
                  <h3 className="text-sm font-700">Le Bonus Budget Pro — repartez avec plus, sans payer plus</h3>
                </div>
                <p className="text-sm text-muted-foreground pl-11">Chaque commande vous donne un crédit en euros à dépenser en produits supplémentaires. Vous payez votre commande habituelle et repartez avec davantage.</p>
                <div className="pl-11 space-y-1.5">
                  {BUDGET_PRO_TIERS.slice(0, 5).map((t) => (
                    <div key={t.min} className="flex items-center justify-between bg-[#FDF8E7] rounded-lg px-3 py-1.5 text-xs">
                      <span className="text-[#8B7009] font-600">Vous commandez {t.min} €</span>
                      <span className="text-pink-600 font-800">→ +{t.bonus} € de produits offerts</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground text-center">Jusqu&apos;à +350 € de produits offerts à partir de 2 500 €</p>
                </div>
              </div>
              {/* Step 3 */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#FDF8E7] text-[#B8960C] text-sm font-800 flex items-center justify-center shrink-0 border border-[#B8960C]/20">3</div>
                  <h3 className="text-sm font-700">Devis + PDF envoyé instantanément par WhatsApp</h3>
                </div>
                <p className="text-sm text-muted-foreground pl-11">Votre devis est prêt en quelques secondes avec le détail, les photos des produits, les produits offerts et le montant final. En PDF téléchargeable directement depuis WhatsApp.</p>
              </div>
              {/* Conditions */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-700 text-amber-700 mb-1">Conditions du Bonus Budget Pro</p>
                <ul className="text-xs text-amber-600 space-y-1">
                  <li>• Valable uniquement sur le devis concerné</li>
                  <li>• Non cumulable avec d&apos;autres avantages</li>
                  <li>• Non reportable sur une commande ultérieure</li>
                  <li>• Non convertible en espèces</li>
                  <li>• À utiliser entièrement sur ce devis</li>
                </ul>
              </div>
              {/* Concept PDF actions */}
              <div className="space-y-2 pt-1">
                <p className="text-xs font-700 text-[#8B7009]">Partager le programme avec la cliente</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleConceptDownload} disabled={generatingConcept}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-[#B8960C] text-white rounded-xl text-xs font-700 hover:bg-[#8B7009] transition-colors disabled:opacity-50">
                    {generatingConcept ? <Icon name="ArrowPathIcon" size={13} className="animate-spin" /> : <Icon name="DocumentArrowDownIcon" size={13} />}
                    {generatingConcept ? 'Génération…' : 'PDF à télécharger'}
                  </button>
                  <button onClick={handleConceptWhatsApp} disabled={sendingConcept}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-green-500 text-white rounded-xl text-xs font-700 hover:bg-green-600 transition-colors disabled:opacity-50">
                    {sendingConcept ? <Icon name="ArrowPathIcon" size={13} className="animate-spin" /> : <Icon name="ChatBubbleLeftRightIcon" size={13} />}
                    {sendingConcept ? 'Upload…' : 'WhatsApp PDF'}
                  </button>
                </div>
              </div>
              <button onClick={() => setShowDecouverteModal(false)} className="w-full py-3 bg-[#B8960C] text-white rounded-xl text-sm font-700 hover:bg-[#8B7009] transition-colors">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
