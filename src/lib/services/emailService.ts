// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReceiptEmailData {
  ticketNumber: string;
  date: string;
  clientName?: string;
  items: Array<{
    name: string;
    qty: number;
    price: number;
    discount?: number;
  }>;
  subtotalHT: number;
  totalTVA: number;
  totalTTC: number;
  paymentMethod: string;
  cashierName?: string;
  loyaltyPoints?: number;
}

export interface InvoiceEmailData {
  type: 'invoice' | 'proforma' | 'credit_note' | 'estimate';
  number: string;
  issueDate: string;
  dueDate: string;
  clientName: string;
  clientEmail: string;
  clientAddress?: string;
  clientSiret?: string;
  clientTva?: string;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    tvaRate: number;
    discount: number;
  }>;
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  paymentTerms: string;
  notes?: string;
  sellerName?: string;
}

export type EmailResult = { success: true; id: string } | { success: false; error: string };

// ─── Core send function ───────────────────────────────────────────────────────

async function callEdgeFunction(payload: {
  type: string;
  to: string;
  subject?: string;
  data: ReceiptEmailData | InvoiceEmailData;
}): Promise<EmailResult> {
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[emailService] API error:', data);
      return { success: false, error: data?.error ?? 'Erreur lors de l\'envoi' };
    }

    if (data?.error) {
      console.error('[emailService] Resend error:', data.error, data.details);
      return { success: false, error: data.error };
    }

    return { success: true, id: data?.id ?? '' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur réseau';
    console.error('[emailService] Network error:', message);
    return { success: false, error: message };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a POS receipt email after payment
 */
export async function sendReceiptEmail(to: string, data: ReceiptEmailData): Promise<EmailResult> {
  return callEdgeFunction({ type: 'receipt', to, data });
}

/**
 * Send a B2B invoice email
 */
export async function sendInvoiceEmail(to: string, data: InvoiceEmailData): Promise<EmailResult> {
  return callEdgeFunction({ type: data.type, to, data });
}

/**
 * Send a quote (devis) email
 */
export async function sendEstimateEmail(to: string, data: InvoiceEmailData): Promise<EmailResult> {
  return callEdgeFunction({ type: 'estimate', to, data: { ...data, type: 'estimate' } });
}

/**
 * Generate a ticket number for POS receipts
 */
export function generateTicketNumber(): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `TKT-${yy}${mm}${dd}-${rand}`;
}

/**
 * Format today's date in French locale
 */
export function todayFR(): string {
  return new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
