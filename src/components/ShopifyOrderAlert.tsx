'use client';

export interface ShopifyNewOrder {
  id: number;
  order_number: number;
  total_price: string;
  financial_status: string;
  customer?: { first_name?: string; last_name?: string } | null;
  line_items?: Array<{ id: number }>;
}

interface ShopifyOrderAlertProps {
  orders: ShopifyNewOrder[];
  onView: (order: ShopifyNewOrder) => void;
  onDismiss: () => void;
}

export function ShopifyOrderAlert({ orders, onView, onDismiss }: ShopifyOrderAlertProps) {
  if (!orders.length) return null;

  const order = orders[0];
  const clientName = order.customer
    ? `${order.customer.first_name ?? ''} ${order.customer.last_name ?? ''}`.trim()
    : 'Client inconnu';
  const nbArticles = order.line_items?.length ?? 0;
  const total = parseFloat(order.total_price || '0').toFixed(2);

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-pink-600 text-white px-4 py-3 shadow-xl">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">🛍️</span>
          <div className="min-w-0">
            <p className="font-black text-base leading-tight tracking-wide uppercase">
              Nouvelle commande Shopify !
            </p>
            <p className="text-sm opacity-90 truncate">
              #{order.order_number} — {clientName} — {total} €
              {' '}· {nbArticles} article{nbArticles > 1 ? 's' : ''} ✅
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {orders.length > 1 && (
            <span className="bg-white text-pink-600 px-2 py-0.5 rounded-full text-xs font-black">
              +{orders.length - 1} autre{orders.length > 2 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => onView(order)}
            className="bg-white text-pink-600 px-4 py-1.5 rounded-lg font-bold text-sm hover:bg-pink-50 transition-colors"
          >
            Voir →
          </button>
          <button
            onClick={onDismiss}
            className="text-white/70 hover:text-white text-xl font-bold px-2 leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
