'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import Image from 'next/image';
import {
  reservationService,
  type CreateReservationInput,
  type ReservationItem,
  type ProductSearchResult,
  type Reservation,
  type ReservationType,
  type RecoveryMode,
  RESERVATION_TYPE_CONFIG,
  RECOVERY_MODE_CONFIG,
} from '@/lib/services/reservationService';

interface ReservationFormModalProps {
  onClose: () => void;
  onSaved: (reservation: any) => void;
  reservation?: Reservation;
}

interface ExtendedItem extends ReservationItem {
  productId?: string;
  imageUrl?: string;
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
  availableStock?: number;
  variant?: string;
  color?: string;
  size?: string;
  model?: string;
  power?: string;
  format?: string;
}

const EMPTY_ITEM: ExtendedItem = { name: '', qty: 1, price: 0, sku: '' };

const STOCK_STATUS_CONFIG = {
  in_stock:    { label: 'En stock',     color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  low_stock:   { label: 'Stock faible', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  out_of_stock:{ label: 'Rupture',      color: 'text-red-700 bg-red-50 border-red-200' },
};

const DEPOSIT_PRESETS = [
  { label: '30%', value: 30 },
  { label: '50%', value: 50 },
  { label: '70%', value: 70 },
];

const RESERVATION_TYPES = Object.entries(RESERVATION_TYPE_CONFIG) as [ReservationType, typeof RESERVATION_TYPE_CONFIG[ReservationType]][];
const RECOVERY_MODES = Object.entries(RECOVERY_MODE_CONFIG) as [RecoveryMode, typeof RECOVERY_MODE_CONFIG[RecoveryMode]][];

// ─── Product Search Dropdown ──────────────────────────────────────────────────
interface ProductSearchDropdownProps {
  onSelect: (product: ProductSearchResult) => void;
  onClose: () => void;
}

function ProductSearchDropdown({ onSelect, onClose }: ProductSearchDropdownProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = useCallback((val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 1) { setResults([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const data = await reservationService.searchProducts(val.trim());
      setResults(data);
      setLoading(false);
    }, 200);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20 bg-black/40 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Icon name="MagnifyingGlassIcon" size={18} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Nom, référence, code-barres, catégorie..."
            className="flex-1 text-sm focus:outline-none text-foreground placeholder:text-muted-foreground"
          />
          {loading && <Icon name="ArrowPathIcon" size={16} className="animate-spin text-muted-foreground shrink-0" />}
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {query.trim().length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <Icon name="MagnifyingGlassIcon" size={28} className="mx-auto mb-2 text-border" />
              <p>Tapez pour rechercher un produit</p>
            </div>
          )}
          {query.trim().length > 0 && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <Icon name="ExclamationCircleIcon" size={28} className="mx-auto mb-2 text-border" />
              Aucun produit trouvé pour &ldquo;{query}&rdquo;
            </div>
          )}
          {results.map((product) => {
            const sc = STOCK_STATUS_CONFIG[product.stockStatus];
            return (
              <button
                key={product.id}
                onClick={() => onSelect(product)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 text-left"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0 border border-border">
                  {product.imageUrl ? (
                    <Image src={product.imageUrl} alt={product.name} width={48} height={48} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon name="PhotoIcon" size={20} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-600 text-foreground truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.ref}{product.category ? ` · ${product.category}` : ''}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-600 border mt-1 ${sc.color}`}>
                    {sc.label} · {product.stock} dispo
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-700 text-foreground">{product.sellPriceTtc.toFixed(2)} €</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Form Modal ──────────────────────────────────────────────────────────
export default function ReservationFormModal({ onClose, onSaved, reservation }: ReservationFormModalProps) {
  const isEditMode = !!reservation;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSyncMsg, setClientSyncMsg] = useState<string | null>(null);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);
  const [outOfStockWarning, setOutOfStockWarning] = useState<{ idx: number; productName: string; stock: number } | null>(null);
  const [pendingProductSelect, setPendingProductSelect] = useState<{ product: ProductSearchResult; idx: number } | null>(null);
  const [expandedVariantIdx, setExpandedVariantIdx] = useState<number | null>(null);

  // Client info
  const [clientName, setClientName] = useState(reservation?.clientName ?? '');
  const [clientPhone, setClientPhone] = useState(reservation?.clientPhone ?? '');
  const [clientEmail, setClientEmail] = useState(reservation?.clientEmail ?? '');

  // Reservation type & recovery
  const [reservationType, setReservationType] = useState<ReservationType | null>(reservation?.reservationType ?? null);
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>(reservation?.recoveryMode ?? 'sur_place');

  // Dates
  const [pickupDate, setPickupDate] = useState(reservation?.pickupDate ? reservation.pickupDate.split('T')[0] : '');
  const [estimatedArrivalDate, setEstimatedArrivalDate] = useState(reservation?.estimatedArrivalDate ?? '');

  // Deposit
  const [depositPercent, setDepositPercent] = useState<number | null>(reservation?.depositPercent ?? null);
  const [depositCustom, setDepositCustom] = useState(reservation?.depositAmount ? String(reservation.depositAmount) : '');

  // Remise
  const [remiseType, setRemiseType] = useState<'none' | 'percentage' | 'fixed'>(
    reservation?.remiseType ?? 'none'
  );
  const [remisePctPreset, setRemisePctPreset] = useState<number | null>(
    reservation?.remiseType === 'percentage' ? (reservation.remiseValeur ?? null) : null
  );
  const [remisePctCustom, setRemisePctCustom] = useState(
    reservation?.remiseType === 'percentage' && reservation.remiseValeur != null &&
    ![5, 10, 15, 20].includes(reservation.remiseValeur) ? String(reservation.remiseValeur) : ''
  );
  const [remiseFixed, setRemiseFixed] = useState(
    reservation?.remiseType === 'fixed' ? String(reservation.remiseValeur ?? '') : ''
  );
  const [remiseMotif, setRemiseMotif] = useState(reservation?.remiseMotif ?? '');

  // Delivery info
  const [deliveryAddress, setDeliveryAddress] = useState(reservation?.deliveryAddress ?? '');
  const [deliveryPhone, setDeliveryPhone] = useState(reservation?.deliveryPhone ?? '');
  const [deliveryContact, setDeliveryContact] = useState(reservation?.deliveryContact ?? '');
  const [deliveryNotes, setDeliveryNotes] = useState(reservation?.deliveryNotes ?? '');

  // Comments
  const [sellerComment, setSellerComment] = useState(reservation?.sellerComment ?? '');
  const [clientComment, setClientComment] = useState(reservation?.clientComment ?? '');
  const [notes, setNotes] = useState(reservation?.notes ?? '');

  // Items
  const [items, setItems] = useState<ExtendedItem[]>(() => {
    if (reservation?.items && reservation.items.length > 0) {
      return reservation.items.map((it) => ({
        name: it.name,
        qty: it.qty,
        price: it.price,
        sku: it.sku ?? '',
        productId: it.productId,
        imageUrl: it.imageUrl,
        variant: it.variant,
        color: it.color,
        size: it.size,
        model: it.model,
        power: it.power,
        format: it.format,
      }));
    }
    return [{ ...EMPTY_ITEM }];
  });

  const totalAmount = items.reduce((sum, it) => sum + it.qty * it.price, 0);

  // Remise calculations
  const remisePct = remiseType === 'percentage'
    ? (remisePctPreset !== null ? remisePctPreset : parseFloat(remisePctCustom) || 0)
    : 0;
  const remiseMontant = remiseType === 'percentage'
    ? Math.round((totalAmount * remisePct) / 100 * 100) / 100
    : remiseType === 'fixed'
    ? Math.min(parseFloat(remiseFixed) || 0, totalAmount)
    : 0;
  const totalFinal = Math.max(0, totalAmount - remiseMontant);

  // Compute deposit amount from percent or custom (base = totalFinal)
  const depositAmount = depositPercent !== null
    ? Math.round((totalFinal * depositPercent) / 100 * 100) / 100
    : parseFloat(depositCustom) || 0;
  const balanceDue = Math.max(0, totalFinal - depositAmount);
  const depositPct = totalFinal > 0 ? Math.round((depositAmount / totalFinal) * 100) : 0;

  const showDeliveryFields = recoveryMode === 'a_livrer' || recoveryMode === 'livraison_en_cours' || recoveryMode === 'expedie';

  const updateItem = (idx: number, field: keyof ExtendedItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const openProductSearch = (idx: number) => {
    setActiveItemIdx(idx);
    setShowProductSearch(true);
  };

  const applyProductToItem = (product: ProductSearchResult, idx: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        name: product.name,
        price: product.sellPriceTtc,
        sku: product.ref,
        productId: product.id,
        imageUrl: product.imageUrl ?? undefined,
        stockStatus: product.stockStatus,
        availableStock: product.stock,
      };
      return next;
    });
  };

  const handleProductSelect = (product: ProductSearchResult, idx: number) => {
    setShowProductSearch(false);
    setActiveItemIdx(null);
    if (product.stockStatus === 'out_of_stock') {
      setOutOfStockWarning({ idx, productName: product.name, stock: product.stock });
      setPendingProductSelect({ product, idx });
      return;
    }
    if (product.stockStatus === 'low_stock') {
      applyProductToItem(product, idx);
      setError(`⚠️ Stock faible pour "${product.name}" : seulement ${product.stock} unité(s) disponible(s).`);
      return;
    }
    applyProductToItem(product, idx);
  };

  const handleOutOfStockConfirm = (preorder: boolean) => {
    if (!pendingProductSelect) return;
    if (preorder) applyProductToItem(pendingProductSelect.product, pendingProductSelect.idx);
    setOutOfStockWarning(null);
    setPendingProductSelect(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) { setError('Le nom du client est requis.'); return; }
    if (items.some((it) => !it.name.trim())) { setError('Tous les articles doivent avoir un nom.'); return; }
    if (remiseMontant > 0 && !remiseMotif.trim()) { setError('Le motif de remise est obligatoire.'); return; }
    setSaving(true);
    setError(null);
    setClientSyncMsg(null);

    // Resolve client_id via phone lookup / creation
    let resolvedClientId: string | undefined = undefined;
    if (clientPhone.trim()) {
      const sync = await reservationService.upsertClientByPhone(
        clientPhone.trim(),
        clientName.trim(),
        clientEmail.trim() || undefined,
      );
      if (sync) {
        resolvedClientId = sync.id;
        if (sync.created) setClientSyncMsg('✅ Client ajouté à votre base');
        else if (sync.emailUpdated) setClientSyncMsg('✅ Email mis à jour dans votre base');
      }
    }

    const itemsPayload: ReservationItem[] = items.map((it) => ({
      name: it.name,
      qty: Number(it.qty),
      price: Number(it.price),
      sku: it.sku || undefined,
      productId: it.productId || undefined,
      imageUrl: it.imageUrl || undefined,
      variant: it.variant || undefined,
      color: it.color || undefined,
      size: it.size || undefined,
      model: it.model || undefined,
      power: it.power || undefined,
      format: it.format || undefined,
    }));

    const commonInput: Partial<CreateReservationInput> = {
      clientId: resolvedClientId,
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim() || undefined,
      clientEmail: clientEmail.trim() || undefined,
      items: itemsPayload,
      totalAmount,
      totalFinal,
      depositAmount,
      depositPercent: depositPercent ?? undefined,
      reservationType: reservationType ?? undefined,
      recoveryMode,
      notes: notes.trim() || undefined,
      sellerComment: sellerComment.trim() || undefined,
      clientComment: clientComment.trim() || undefined,
      pickupDate: pickupDate || undefined,
      estimatedArrivalDate: estimatedArrivalDate || undefined,
      deliveryAddress: deliveryAddress.trim() || undefined,
      deliveryPhone: deliveryPhone.trim() || undefined,
      deliveryContact: deliveryContact.trim() || undefined,
      deliveryNotes: deliveryNotes.trim() || undefined,
      cashierName: 'Sophie Fontaine',
      remiseType: remiseType === 'none' ? null : remiseType,
      remiseValeur: remiseMontant > 0 ? (remiseType === 'percentage' ? remisePct : (parseFloat(remiseFixed) || 0)) : null,
      remiseMontant: remiseMontant > 0 ? remiseMontant : null,
      remiseMotif: remiseMontant > 0 ? remiseMotif.trim() || null : null,
    };

    try {
      if (isEditMode && reservation) {
        const updated = await reservationService.update(reservation.id, commonInput as any);
        setSaving(false);
        onSaved(updated);
      } else {
        const saved = await reservationService.create(commonInput as CreateReservationInput);
        setSaving(false);
        onSaved(saved);
      }
    } catch (err: any) {
      setSaving(false);
      setError(`Erreur de sauvegarde : ${err.message}`);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Icon name={isEditMode ? 'PencilSquareIcon' : 'CalendarDaysIcon'} size={20} className="text-primary" />
              <h2 className="text-base font-600 text-foreground">
                {isEditMode ? `Modifier — ${reservation?.reservationNumber}` : 'Nouvelle réservation avancée'}
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <Icon name="XMarkIcon" size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-6">

            {/* ── 1. Client info ── */}
            <section>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Informations client</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-500 text-foreground mb-1">Nom complet <span className="text-destructive">*</span></label>
                  <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex: Amina Benali"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-xs font-500 text-foreground mb-1">Téléphone</label>
                  <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="06 XX XX XX XX"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-xs font-500 text-foreground mb-1">Email</label>
                  <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="email@exemple.com"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-xs font-500 text-foreground mb-1">Date de retrait prévue</label>
                  <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </section>

            {/* ── 2. Reservation type tags ── */}
            <section>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Type de réservation</p>
              <div className="flex flex-wrap gap-2">
                {RESERVATION_TYPES.map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setReservationType(reservationType === key ? null : key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-600 border transition-all ${
                      reservationType === key ? cfg.color + ' ring-2 ring-offset-1 ring-current/30' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    <Icon name={cfg.icon as any} size={12} />
                    {cfg.label}
                  </button>
                ))}
              </div>
            </section>

            {/* ── 3. Recovery mode ── */}
            <section>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Mode de récupération</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {RECOVERY_MODES.map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRecoveryMode(key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-500 transition-all ${
                      recoveryMode === key ? cfg.color + ' ring-1 ring-current/30' : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    <Icon name={cfg.icon as any} size={13} />
                    {cfg.label}
                  </button>
                ))}
              </div>

              {/* Delivery fields */}
              {showDeliveryFields && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="col-span-full text-xs font-600 text-blue-700 uppercase tracking-wide">Informations livraison</p>
                  <div className="col-span-full">
                    <label className="block text-xs font-500 text-foreground mb-1">Adresse de livraison</label>
                    <input type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Adresse complète"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-500 text-foreground mb-1">Téléphone livraison</label>
                    <input type="tel" value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} placeholder="06 XX XX XX XX"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-500 text-foreground mb-1">Nom contact</label>
                    <input type="text" value={deliveryContact} onChange={(e) => setDeliveryContact(e.target.value)} placeholder="Nom du destinataire"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="col-span-full">
                    <label className="block text-xs font-500 text-foreground mb-1">Notes livraison</label>
                    <input type="text" value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} placeholder="Digicode, étage, instructions..."
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
              )}
            </section>

            {/* ── 4. Articles ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground">Articles réservés</p>
                <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs font-500 text-primary hover:text-accent transition-colors">
                  <Icon name="PlusIcon" size={14} /> Ajouter un article
                </button>
              </div>
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="border border-border rounded-xl p-3 bg-muted/20">
                    {/* Product search + image */}
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                        {item.imageUrl ? (
                          <Image src={item.imageUrl} alt={item.name || 'Produit'} width={48} height={48} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon name="PhotoIcon" size={20} className="text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => openProductSearch(idx)}
                          className="w-full flex items-center gap-2 px-3 py-2 border border-dashed border-primary/40 rounded-lg text-sm text-primary hover:bg-primary/5 transition-colors"
                        >
                          <Icon name="MagnifyingGlassIcon" size={14} />
                          {item.name ? (
                            <span className="truncate font-500 text-foreground">{item.name}</span>
                          ) : (
                            <span className="text-muted-foreground">Rechercher dans la base produits...</span>
                          )}
                        </button>
                        {item.stockStatus && (
                          <div className="mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-600 border ${STOCK_STATUS_CONFIG[item.stockStatus].color}`}>
                              {STOCK_STATUS_CONFIG[item.stockStatus].label}
                              {item.availableStock !== undefined && ` · ${item.availableStock} dispo`}
                            </span>
                          </div>
                        )}
                      </div>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                          <Icon name="TrashIcon" size={14} />
                        </button>
                      )}
                    </div>

                    {/* Main fields */}
                    <div className="grid grid-cols-12 gap-2 mb-2">
                      <div className="col-span-5">
                        <input type="text" value={item.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} placeholder="Nom de l'article"
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div className="col-span-2">
                        <input type="text" value={item.sku || ''} onChange={(e) => updateItem(idx, 'sku', e.target.value)} placeholder="Réf."
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(idx, 'qty', parseInt(e.target.value) || 1)} placeholder="Qté"
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div className="col-span-3">
                        <input type="number" min="0" step="0.01" value={item.price} onChange={(e) => updateItem(idx, 'price', parseFloat(e.target.value) || 0)} placeholder="Prix €"
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                    </div>

                    {/* Variant toggle */}
                    <button
                      type="button"
                      onClick={() => setExpandedVariantIdx(expandedVariantIdx === idx ? null : idx)}
                      className="flex items-center gap-1.5 text-xs text-primary hover:text-accent transition-colors"
                    >
                      <Icon name={expandedVariantIdx === idx ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={12} />
                      {expandedVariantIdx === idx ? 'Masquer déclinaisons' : 'Ajouter déclinaison (couleur, taille, modèle...)'}
                      {(item.color || item.size || item.model || item.power || item.format || item.variant) && (
                        <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-600">Renseigné</span>
                      )}
                    </button>

                    {/* Variant fields */}
                    {expandedVariantIdx === idx && (
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-violet-50 border border-violet-200 rounded-lg">
                        <div>
                          <label className="block text-[10px] font-600 text-violet-700 mb-1 uppercase">Couleur</label>
                          <input type="text" value={item.color || ''} onChange={(e) => updateItem(idx, 'color', e.target.value)} placeholder="Ex: Rose, Nude..."
                            className="w-full border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-600 text-violet-700 mb-1 uppercase">Taille</label>
                          <input type="text" value={item.size || ''} onChange={(e) => updateItem(idx, 'size', e.target.value)} placeholder="Ex: S, M, L, XL..."
                            className="w-full border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-600 text-violet-700 mb-1 uppercase">Modèle</label>
                          <input type="text" value={item.model || ''} onChange={(e) => updateItem(idx, 'model', e.target.value)} placeholder="Ex: Pro, Lite..."
                            className="w-full border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-600 text-violet-700 mb-1 uppercase">Puissance</label>
                          <input type="text" value={item.power || ''} onChange={(e) => updateItem(idx, 'power', e.target.value)} placeholder="Ex: 36W, 128W..."
                            className="w-full border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-600 text-violet-700 mb-1 uppercase">Format</label>
                          <input type="text" value={item.format || ''} onChange={(e) => updateItem(idx, 'format', e.target.value)} placeholder="Ex: 100ml, 250ml..."
                            className="w-full border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-600 text-violet-700 mb-1 uppercase">Variante libre</label>
                          <input type="text" value={item.variant || ''} onChange={(e) => updateItem(idx, 'variant', e.target.value)} placeholder="Autre précision..."
                            className="w-full border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <span className="text-sm font-600 text-foreground">Total : {totalAmount.toFixed(2)} €</span>
              </div>
            </section>

            {/* ── 5. Deposit ── */}
            <section>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Acompte</p>
              <div className="space-y-3">
                {/* Preset % buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {DEPOSIT_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => { setDepositPercent(depositPercent === preset.value ? null : preset.value); setDepositCustom(''); }}
                      className={`px-4 py-2 rounded-lg border text-sm font-600 transition-all ${
                        depositPercent === preset.value
                          ? 'border-primary bg-primary/10 text-primary' :'border-border text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <span className="text-xs text-muted-foreground">ou</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="0" step="0.01"
                      value={depositPercent !== null ? '' : depositCustom}
                      onChange={(e) => { setDepositPercent(null); setDepositCustom(e.target.value); }}
                      placeholder="Montant libre €"
                      className="w-32 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                {/* Summary */}
                {depositAmount > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-[10px] text-amber-600 uppercase font-600">Total{remiseMontant > 0 ? ' après remise' : ''}</p>
                      <p className="text-base font-700 tabular-nums text-amber-800">{totalFinal.toFixed(2)} €</p>
                    </div>
                    <div className="text-center border-x border-amber-200">
                      <p className="text-[10px] text-amber-600 uppercase font-600">Acompte ({depositPct}%)</p>
                      <p className="text-base font-700 tabular-nums text-amber-800">{depositAmount.toFixed(2)} €</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-amber-600 uppercase font-600">Reste dû</p>
                      <p className="text-base font-700 tabular-nums text-amber-800">{balanceDue.toFixed(2)} €</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── 5.5. Remise ── */}
            <section>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Remise</p>
              <div className="space-y-3">
                {/* Type selector */}
                <div className="flex gap-2">
                  {([
                    { key: 'none',       label: 'Aucune' },
                    { key: 'percentage', label: '% Pourcentage' },
                    { key: 'fixed',      label: '€ Montant fixe' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRemiseType(key)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-600 transition-all ${
                        remiseType === key
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-border text-muted-foreground hover:border-violet-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Percentage controls */}
                {remiseType === 'percentage' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {[5, 10, 15, 20].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => { setRemisePctPreset(remisePctPreset === pct ? null : pct); setRemisePctCustom(''); }}
                          className={`px-4 py-2 rounded-lg border text-sm font-600 transition-all ${
                            remisePctPreset === pct
                              ? 'border-violet-500 bg-violet-50 text-violet-700'
                              : 'border-border text-muted-foreground hover:border-violet-300'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                      <span className="text-xs text-muted-foreground">ou</span>
                      <input
                        type="number" min="0" max="100" step="0.1"
                        value={remisePctPreset !== null ? '' : remisePctCustom}
                        onChange={(e) => { setRemisePctPreset(null); setRemisePctCustom(e.target.value); }}
                        placeholder="% libre"
                        className="w-24 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                      />
                    </div>
                  </div>
                )}

                {/* Fixed amount control */}
                {remiseType === 'fixed' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="0" step="0.01"
                      value={remiseFixed}
                      onChange={(e) => setRemiseFixed(e.target.value)}
                      placeholder="Montant en €"
                      className="w-36 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <span className="text-sm text-muted-foreground">€</span>
                  </div>
                )}

                {/* Motif */}
                {remiseType !== 'none' && (
                  <div>
                    <label className="block text-xs font-500 text-foreground mb-1">
                      Motif <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={remiseMotif}
                      onChange={(e) => setRemiseMotif(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                    >
                      <option value="">— Choisir un motif —</option>
                      <option value="fidélité">Fidélité client</option>
                      <option value="geste_commercial">Geste commercial</option>
                      <option value="offre_spéciale">Offre spéciale</option>
                      <option value="erreur_prix">Correction de prix</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                )}

                {/* Recap */}
                {remiseMontant > 0 && (
                  <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-[10px] text-violet-600 uppercase font-600">Sous-total</p>
                      <p className="text-base font-700 tabular-nums text-violet-800">{totalAmount.toFixed(2)} €</p>
                    </div>
                    <div className="text-center border-x border-violet-200">
                      <p className="text-[10px] text-violet-600 uppercase font-600">
                        Remise{remiseType === 'percentage' ? ` (${remisePct}%)` : ''}
                      </p>
                      <p className="text-base font-700 tabular-nums text-violet-800">−{remiseMontant.toFixed(2)} €</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-violet-600 uppercase font-600">Total final</p>
                      <p className="text-base font-700 tabular-nums text-violet-900">{totalFinal.toFixed(2)} €</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── 6. Dates ── */}
            <section>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Dates importantes</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-500 text-foreground mb-1">Date estimée d'arrivée</label>
                  <input type="date" value={estimatedArrivalDate} onChange={(e) => setEstimatedArrivalDate(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </section>

            {/* ── 7. Internal notes ── */}
            <section>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Commentaires internes</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-500 text-foreground mb-1">Commentaire vendeur</label>
                  <textarea value={sellerComment} onChange={(e) => setSellerComment(e.target.value)} rows={2}
                    placeholder="Notes internes pour l'équipe..."
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-500 text-foreground mb-1">Commentaire client</label>
                  <textarea value={clientComment} onChange={(e) => setClientComment(e.target.value)} rows={2}
                    placeholder="Demandes spéciales du client..."
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-500 text-foreground mb-1">Notes générales</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    placeholder="Instructions spéciales, préférences..."
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                </div>
              </div>
            </section>

            {clientSyncMsg && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <Icon name="CheckCircleIcon" size={16} />
                {clientSyncMsg}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Icon name="ExclamationTriangleIcon" size={16} />
                {error}
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-500 text-muted-foreground hover:text-foreground transition-colors">
              Annuler
            </button>
            <button
              onClick={handleSubmit as any}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-500 rounded-lg hover:bg-accent transition-colors disabled:opacity-60"
            >
              {saving ? <Icon name="ArrowPathIcon" size={15} className="animate-spin" /> : <Icon name="CheckIcon" size={15} />}
              {saving ? 'Enregistrement...' : isEditMode ? 'Enregistrer les modifications' : 'Créer la réservation'}
            </button>
          </div>
        </div>
      </div>

      {/* Product search overlay */}
      {showProductSearch && activeItemIdx !== null && (
        <ProductSearchDropdown
          onSelect={(product) => handleProductSelect(product, activeItemIdx)}
          onClose={() => { setShowProductSearch(false); setActiveItemIdx(null); }}
        />
      )}

      {/* Out of stock warning */}
      {outOfStockWarning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Icon name="ExclamationTriangleIcon" size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-600 text-foreground">Produit en rupture</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Stock épuisé / en commande fournisseur</p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-1">
              <span className="font-600">{outOfStockWarning.productName}</span> est actuellement en rupture de stock.
            </p>
            <p className="text-sm text-muted-foreground mb-5">
              Voulez-vous créer une <span className="font-600 text-primary">précommande</span> pour ce produit ?
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => handleOutOfStockConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-500 rounded-lg hover:bg-accent transition-colors">
                <Icon name="ClockIcon" size={15} />
                Précommande (réserver quand même)
              </button>
              <button onClick={() => handleOutOfStockConfirm(false)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-border text-sm font-500 text-muted-foreground rounded-lg hover:bg-muted transition-colors">
                <Icon name="XMarkIcon" size={15} />
                Refuser cet article
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
