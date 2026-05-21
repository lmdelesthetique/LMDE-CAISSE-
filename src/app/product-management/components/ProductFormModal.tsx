'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import Icon from '@/components/ui/AppIcon';
import { type ProductRecord, type ColorVariant } from './mockProducts';
import { createClient } from '@/lib/supabase/client';
import { categoryStore } from '@/lib/stores/dataStore';

const supabase = createClient();

type FormTab = 'general' | 'pricing' | 'stock' | 'variants' | 'advanced';

interface ProductFormData {
  name: string;
  ref: string;
  barcode: string;
  category: string;
  supplier: string;
  supplierId: string;
  buyPrice: number;
  transport: number;
  transportPct: number;
  customs: number;
  otherFees: number;
  structurePct: number;
  sellPriceHT: number;
  tva: number;
  minStock: number;
  quantityAvailable: number;
  location: string;
  status: string;
  shopify: boolean;
  reservable: boolean;
  sellable: boolean;
  description: string;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface ProductFormModalProps {
  product: ProductRecord | null;
  onClose: () => void;
  onSave: (data: ProductFormData, imageUrl?: string, colorVariants?: ColorVariant[]) => void;
}

const tabs: { id: FormTab; label: string; icon: string }[] = [
  { id: 'general', label: 'Général', icon: 'InformationCircleIcon' },
  { id: 'pricing', label: 'Tarification', icon: 'CurrencyEuroIcon' },
  { id: 'stock', label: 'Stock', icon: 'ArchiveBoxIcon' },
  { id: 'variants', label: 'Déclinaisons', icon: 'SwatchIcon' },
  { id: 'advanced', label: 'Avancé', icon: 'Cog6ToothIcon' },
];

const PRESET_COLORS = [
  { name: 'Noir', hex: '#1a1a1a' }, { name: 'Blanc', hex: '#FFFFFF' },
  { name: 'Rose', hex: '#FFB6C1' }, { name: 'Rouge', hex: '#E53E3E' },
  { name: 'Nude', hex: '#F4C2A1' }, { name: 'Beige', hex: '#F5DEB3' },
  { name: 'Or', hex: '#FFD700' }, { name: 'Argent', hex: '#C0C0C0' },
  { name: 'Violet', hex: '#805AD5' }, { name: 'Bleu', hex: '#3182CE' },
  { name: 'Vert', hex: '#38A169' }, { name: 'Brun', hex: '#8B4513' },
];

export default function ProductFormModal({ product, onClose, onSave }: ProductFormModalProps) {
  const [activeTab, setActiveTab] = useState<FormTab>('general');
  const [loading, setLoading] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  // Image state
  const [imagePreview, setImagePreview] = useState<string | null>(product?.imageUrl ? `${product.imageUrl}?t=${Date.now()}` : null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Color variants state
  const [colorVariants, setColorVariants] = useState<ColorVariant[]>(
    product?.colorVariants ? [...product.colorVariants] : []
  );
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#FFB6C1');
  const [newColorQty, setNewColorQty] = useState(0);
  const [newColorMin, setNewColorMin] = useState(0);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ colorName: string; colorHex: string }>({ colorName: '', colorHex: '#000000' });

  // Load real suppliers and categories from DB
  useEffect(() => {
    supabase.from('suppliers').select('id, company_name').eq('is_active', true).order('company_name').then(({ data }) => {
      if (data) setSupplierOptions(data.map((s: any) => ({ id: s.id, name: s.company_name })));
    });

    // Load categories from the categories table (single source of truth)
    const syncCategories = () => {
      const cats = categoryStore.getAll();
      if (cats.length > 0) {
        setCategoryOptions(cats.filter(c => c.is_active).map(c => c.name).sort());
      }
    };

    // Initial load
    categoryStore.load().then(() => syncCategories());

    // Subscribe to real-time store updates (new categories created elsewhere appear immediately)
    const unsub = categoryStore.subscribe(syncCategories);
    return () => unsub();
  }, []);

  // ── Auto-generate reference & barcode for new products ──────────────────────
  const generateRef = useCallback(async (categoryName: string): Promise<string> => {
    // Build prefix from category (max 8 chars, uppercase, no spaces)
    const prefix = (categoryName || 'PROD')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || 'PROD';

    // Count existing products with this prefix to get next number
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .ilike('ref', `${prefix}-%`);

    const nextNum = ((count ?? 0) + 1).toString().padStart(4, '0');
    return `${prefix}-${nextNum}`;
  }, []);

  const generateBarcode = useCallback(async (): Promise<string> => {
    // Generate a unique 12-digit numeric code (CODE128 compatible)
    // Format: 2 + timestamp-based 9 digits + 1 random digit
    const ts = Date.now().toString().slice(-9);
    const rand = Math.floor(Math.random() * 10).toString();
    const candidate = `2${ts}${rand}`;

    // Ensure uniqueness
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('barcode', candidate);

    if ((count ?? 0) === 0) return candidate;
    // Fallback: add extra random suffix
    return `2${ts}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`.slice(0, 12);
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ProductFormData>({
    defaultValues: product
      ? {
          name: product.name,
          ref: product.ref,
          barcode: product.barcode,
          category: product.category,
          supplier: product.supplier,
          supplierId: (product as any).supplierId || '',
          buyPrice: product.buyPrice,
          transport: product.transport,
          transportPct: (product as any).transportPct || 0,
          customs: product.customs,
          otherFees: 0,
          structurePct: (product as any).structurePct || 0,
          sellPriceHT: product.sellPriceHT,
          tva: 8.5,
          minStock: product.minStock,
          quantityAvailable: product.stock || 0,
          location: '',
          status: product.status,
          shopify: product.shopify,
          reservable: true,
          sellable: true,
          description: '',
        }
      : {
          tva: 8.5,
          status: 'active',
          shopify: false,
          reservable: true,
          sellable: true,
          buyPrice: 0,
          transport: 0,
          transportPct: 0,
          customs: 0,
          otherFees: 0,
          structurePct: 0,
          sellPriceHT: 0,
          minStock: 5,
          quantityAvailable: 0,
          supplierId: '',
          supplier: '',
        },
  });

  const buyPrice = watch('buyPrice') || 0;
  const transport = watch('transport') || 0;
  const transportPct = watch('transportPct') || 0;
  const customs = watch('customs') || 0;
  const otherFees = watch('otherFees') || 0;
  const structurePct = watch('structurePct') || 0;
  const sellPriceHT = watch('sellPriceHT') || 0;
  const tva = watch('tva') || 8.5;
  const minStock = watch('minStock') || 0;
  const quantityAvailable = watch('quantityAvailable') || 0;
  const selectedSupplierId = watch('supplierId');
  const watchedCategory = watch('category');
  const watchedRef = watch('ref');
  const watchedBarcode = watch('barcode');

  // When supplier changes, auto-fill supplier name
  useEffect(() => {
    if (selectedSupplierId) {
      const found = supplierOptions.find(s => s.id === selectedSupplierId);
      if (found) setValue('supplier', found.name);
    }
  }, [selectedSupplierId, supplierOptions, setValue]);

  // Auto-generate ref when category is selected and ref is empty (new product only)
  useEffect(() => {
    if (!product && watchedCategory && !watchedRef) {
      generateRef(watchedCategory).then(ref => setValue('ref', ref));
    }
  }, [watchedCategory, product, watchedRef, generateRef, setValue]);

  // Auto-generate barcode when ref is set and barcode is empty (new product only)
  useEffect(() => {
    if (!product && watchedRef && !watchedBarcode) {
      generateBarcode().then(bc => setValue('barcode', bc));
    }
  }, [watchedRef, product, watchedBarcode, generateBarcode, setValue]);

  const transportPctAmount = Number(buyPrice) * (Number(transportPct) / 100);
  const costPrice = Number(buyPrice) + Number(transport) + transportPctAmount + Number(customs) + Number(otherFees);
  const structureAmount = costPrice * (Number(structurePct) / 100);
  const realBusinessCost = costPrice + structureAmount;
  const sellPriceTTC = Number(sellPriceHT) * (1 + Number(tva) / 100);
  const marginAmount = Number(sellPriceHT) - realBusinessCost;
  const tauxDeMarque = sellPriceHT > 0 ? (marginAmount / Number(sellPriceHT)) * 100 : 0;
  const tauxDeMarge = realBusinessCost > 0 ? (marginAmount / realBusinessCost) * 100 : 0;
  const marginPct = tauxDeMarque;

  // TTC bidirectional input
  const [ttcDisplay, setTtcDisplay] = useState<string>(() =>
    ((product?.sellPriceHT || 0) * (1 + 8.5 / 100)).toFixed(2)
  );
  const isEditingTTCRef = useRef(false);

  useEffect(() => {
    if (!isEditingTTCRef.current) {
      const ttc = Number(sellPriceHT) * (1 + Number(tva) / 100);
      setTtcDisplay(ttc > 0 ? ttc.toFixed(2) : '0.00');
    }
  }, [sellPriceHT, tva]);

  const handleTTCChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isEditingTTCRef.current = true;
    setTtcDisplay(e.target.value);
    const ttc = parseFloat(e.target.value);
    if (!isNaN(ttc) && ttc >= 0) {
      const ht = ttc / (1 + Number(tva) / 100);
      setValue('sellPriceHT', Math.round(ht * 10000) / 10000, { shouldDirty: true });
    }
  };

  const handleTTCBlur = () => {
    isEditingTTCRef.current = false;
    const ttc = Number(sellPriceHT) * (1 + Number(tva) / 100);
    setTtcDisplay(ttc.toFixed(2));
  };

  // Stock status computation
  const getStockStatus = (qty: number, min: number) => {
    if (qty === 0) return { label: 'Rupture', color: 'bg-red-100 text-red-700 border-red-200' };
    if (qty <= min) return { label: 'Stock faible', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    return { label: 'Stock OK', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  };
  const stockStatus = getStockStatus(Number(quantityAvailable), Number(minStock));

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    // Validate file type
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setUploadError('Format non supporté. Utilisez JPG, PNG ou WebP.');
      return;
    }
    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image trop lourde. Maximum 5 Mo.');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => { setImagePreview(ev.target?.result as string); };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageFile(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddColor = () => {
    if (!newColorName.trim()) return;
    const exists = colorVariants.some((cv) => cv.colorName.toLowerCase() === newColorName.trim().toLowerCase());
    if (exists) return;
    const newVariant: ColorVariant = {
      id: `cv-new-${Date.now()}`,
      colorName: newColorName.trim(),
      colorHex: newColorHex,
      quantity: newColorQty,
      minStock: newColorMin,
    };
    setColorVariants((prev) => [...prev, newVariant]);
    setNewColorName('');
    setNewColorHex('#FFB6C1');
    setNewColorQty(0);
    setNewColorMin(0);
  };

  const handleRemoveColor = (id: string) => setColorVariants((prev) => prev.filter((cv) => cv.id !== id));
  const handleColorQtyChange = (id: string, qty: number) => setColorVariants((prev) => prev.map((cv) => (cv.id === id ? { ...cv, quantity: qty } : cv)));
  const handleColorMinChange = (id: string, min: number) => setColorVariants((prev) => prev.map((cv) => (cv.id === id ? { ...cv, minStock: min } : cv)));
  const handlePresetColor = (name: string, hex: string) => { setNewColorName(name); setNewColorHex(hex); };

  const startEditVariant = (cv: ColorVariant) => {
    setEditingVariantId(cv.id);
    setEditDraft({ colorName: cv.colorName, colorHex: cv.colorHex });
  };
  const confirmEditVariant = (id: string) => {
    if (!editDraft.colorName.trim()) return;
    setColorVariants((prev) => prev.map((cv) => cv.id === id ? { ...cv, colorName: editDraft.colorName.trim(), colorHex: editDraft.colorHex } : cv));
    setEditingVariantId(null);
  };
  const cancelEditVariant = () => setEditingVariantId(null);

  const onSubmit = async (data: ProductFormData) => {
    setLoading(true);
    setUploadError(null);
    // Start with existing image URL (strip cache-busting param if present)
    let uploadedImageUrl: string | undefined = undefined;
    if (imagePreview && !imagePreview.startsWith('data:')) {
      // It's an existing URL — strip cache-busting query param
      uploadedImageUrl = imagePreview.split('?')[0];
    } else if (!imagePreview) {
      // Image was removed
      uploadedImageUrl = undefined;
    }

    // Upload image to Supabase storage if a new file was selected
    if (imageFile) {
      try {
        const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const productRef = (data.ref || data.name || 'product').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        const fileName = `${productRef}-${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, imageFile, { upsert: true, contentType: imageFile.type });
        if (uploadError) {
          setUploadError(`Erreur upload image : ${uploadError.message}`);
          setLoading(false);
          return;
        }
        if (uploadData) {
          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(uploadData.path);
          uploadedImageUrl = urlData?.publicUrl || undefined;
        }
      } catch (err: any) {
        setUploadError(`Erreur upload image : ${err?.message || 'Erreur inconnue'}`);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    onSave(data, uploadedImageUrl, colorVariants.length > 0 ? colorVariants : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-[16px] font-700 text-foreground">{product ? 'Modifier le produit' : 'Nouveau produit'}</h2>
            {product && <p className="text-xs text-muted-foreground mt-0.5">{product.ref} — {product.name}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 px-4 pt-3 border-b border-border shrink-0 overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => (
            <button
              key={`form-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-600 whitespace-nowrap transition-all duration-150 border-b-2 -mb-px ${activeTab === tab.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
            >
              <Icon name={tab.icon as Parameters<typeof Icon>[0]['name']} size={14} />
              {tab.label}
              {tab.id === 'variants' && colorVariants.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-700">{colorVariants.length}</span>
              )}
              {tab.id === 'stock' && (
                <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-700 border ${stockStatus.color}`}>
                  {stockStatus.label}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">

            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                {/* Product Image Upload */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1">Photo du produit</label>
                  <p className="text-xs text-muted-foreground mb-2">JPG, PNG ou WebP — max 5 Mo.</p>
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                      {imagePreview ? (
                        <img src={imagePreview} alt="Aperçu du produit" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-muted-foreground">
                          <Icon name="PhotoIcon" size={24} />
                          <span className="text-[10px]">Aucune photo</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageChange} className="hidden" id="product-image-input" />
                      <label htmlFor="product-image-input" className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-600 text-foreground hover:bg-muted cursor-pointer transition-colors w-fit">
                        <Icon name="ArrowUpTrayIcon" size={14} />
                        {imagePreview ? 'Changer la photo' : 'Choisir une photo'}
                      </label>
                      {imagePreview && (
                        <button type="button" onClick={handleRemoveImage} className="inline-flex items-center gap-2 px-3 py-2 border border-red-200 rounded-lg text-sm font-600 text-red-600 hover:bg-red-50 cursor-pointer transition-colors w-fit">
                          <Icon name="TrashIcon" size={14} />
                          Supprimer la photo
                        </button>
                      )}
                      <p className="text-xs text-muted-foreground">{imageFile ? `Fichier sélectionné : ${imageFile.name}` : 'Aucun fichier sélectionné'}</p>
                      {uploadError && (
                        <p className="text-xs text-red-600 font-500 flex items-center gap-1">
                          <Icon name="ExclamationCircleIcon" size={12} />
                          {uploadError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-600 text-foreground mb-1">Nom du produit <span className="text-red-500">*</span></label>
                  <input {...register('name', { required: 'Le nom est obligatoire' })} placeholder="Ex : Kit Gel X Complet Débutante" className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-600 text-foreground mb-1">Référence interne</label>
                    <div className="relative">
                      <input {...register('ref')} placeholder="Ex : GEX-KIT-01" className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors pr-8" />
                      {!product && (
                        <button
                          type="button"
                          title="Régénérer la référence"
                          onClick={async () => {
                            const cat = watchedCategory || 'PROD';
                            const ref = await generateRef(cat);
                            setValue('ref', ref);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Icon name="ArrowPathIcon" size={13} />
                        </button>
                      )}
                    </div>
                    {!product && <p className="text-[11px] text-muted-foreground mt-1">Générée automatiquement si vide</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-600 text-foreground mb-1">Code-barres</label>
                    <div className="relative">
                      <input {...register('barcode')} placeholder="Généré automatiquement" className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors pr-8" />
                      {!product && (
                        <button
                          type="button"
                          title="Régénérer le code-barres"
                          onClick={async () => {
                            const bc = await generateBarcode();
                            setValue('barcode', bc);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Icon name="ArrowPathIcon" size={13} />
                        </button>
                      )}
                    </div>
                    {!product && <p className="text-[11px] text-muted-foreground mt-1">CODE128 — généré automatiquement si vide</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-600 text-foreground mb-1">Catégorie <span className="text-red-500">*</span></label>
                    <select {...register('category', { required: 'La catégorie est obligatoire' })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white cursor-pointer">
                      <option value="">Sélectionner…</option>
                      {categoryOptions.map((c) => <option key={`opt-cat-${c}`} value={c}>{c}</option>)}
                    </select>
                    {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-600 text-foreground mb-1">Fournisseur</label>
                    <select
                      {...register('supplierId')}
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white cursor-pointer"
                    >
                      <option value="">Aucun</option>
                      {supplierOptions.map((s) => <option key={`opt-sup-${s.id}`} value={s.id}>{s.name}</option>)}
                    </select>
                    {selectedSupplierId && (
                      <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                        <Icon name="CheckCircleIcon" size={11} />
                        Produit lié à ce fournisseur automatiquement
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-600 text-foreground mb-1">Description</label>
                  <textarea {...register('description')} rows={3} placeholder="Description du produit, caractéristiques, utilisation…" className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none" />
                </div>

                <div>
                  <label className="block text-sm font-600 text-foreground mb-1">Statut</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { val: 'active', label: 'Actif' },
                      { val: 'inactive', label: 'Inactif' },
                      { val: 'rupture', label: 'Rupture' },
                      { val: 'coming_soon', label: 'Bientôt dispo' },
                    ].map((s) => (
                      <label key={`status-opt-${s.val}`} className="cursor-pointer">
                        <input type="radio" {...register('status')} value={s.val} className="sr-only" />
                        <div className={`py-2 px-2 rounded-lg border text-center text-xs font-600 transition-all cursor-pointer ${watch('status') === s.val ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                          {s.label}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PRICING TAB */}
            {activeTab === 'pricing' && (
              <div className="space-y-5">
                <div className="bg-muted/30 rounded-xl p-4">
                  <h3 className="text-sm font-700 text-foreground mb-3">Coûts d'achat</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1.5">Prix d'achat fournisseur (€)</label>
                      <input {...register('buyPrice', { valueAsNumber: true, min: 0 })} type="number" step="0.01" placeholder="0.00" className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1.5">Frais de transport (€)</label>
                      <input {...register('transport', { valueAsNumber: true, min: 0 })} type="number" step="0.01" placeholder="0.00" className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1.5">Frais de transport (%)</label>
                      <div className="relative">
                        <input {...register('transportPct', { valueAsNumber: true, min: 0, max: 100 })} type="number" step="0.5" placeholder="0" className="w-full px-3 py-2 pr-8 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                      {transportPct > 0 && buyPrice > 0 && <p className="text-[11px] text-blue-600 mt-1">= {transportPctAmount.toFixed(2)} € sur prix achat</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1.5">Frais de douane (€)</label>
                      <input {...register('customs', { valueAsNumber: true, min: 0 })} type="number" step="0.01" placeholder="0.00" className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1.5">Autres frais (€)</label>
                      <input {...register('otherFees', { valueAsNumber: true, min: 0 })} type="number" step="0.01" placeholder="0.00" className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1.5">Frais structure (%)</label>
                      <div className="relative">
                        <input {...register('structurePct', { valueAsNumber: true, min: 0, max: 100 })} type="number" step="0.5" placeholder="0" className="w-full px-3 py-2 pr-8 border border-purple-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-200 bg-purple-50/30" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                      {structurePct > 0 && <p className="text-[11px] text-purple-600 mt-1">= {structureAmount.toFixed(2)} € (loyer · salaires · charges)</p>}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-border">
                      <span className="text-sm text-muted-foreground">Coût de revient réel</span>
                      <span className="text-sm font-600 tabular-nums text-foreground">{costPrice.toFixed(2)} €</span>
                    </div>
                    {structurePct > 0 && (
                      <div className="flex items-center justify-between bg-purple-50 rounded-lg px-4 py-2 border border-purple-200">
                        <span className="text-sm font-700 text-purple-800">Coût business réel</span>
                        <span className="text-base font-700 tabular-nums text-purple-800">{realBusinessCost.toFixed(2)} €</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-muted/30 rounded-xl p-4">
                  <h3 className="text-sm font-700 text-foreground mb-3">Prix de vente</h3>

                  {/* Double saisie HT ↔ TTC */}
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1.5">
                        Prix de vente HT (€) <span className="text-red-500">*</span>
                        <span className="ml-1.5 text-[10px] text-blue-500 font-400">→ calcule TTC</span>
                      </label>
                      <input
                        {...register('sellPriceHT', { valueAsNumber: true, required: 'Le prix HT est obligatoire', min: { value: 0.01, message: 'Le prix doit être positif' } })}
                        type="number" step="0.01" placeholder="0.00"
                        className="w-full px-3 py-2 border border-primary/40 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-blue-50/30"
                      />
                      {errors.sellPriceHT && <p className="text-xs text-red-500 mt-1">{errors.sellPriceHT.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1.5">
                        Prix de vente TTC (€)
                        <span className="ml-1.5 text-[10px] text-emerald-500 font-400">→ calcule HT</span>
                      </label>
                      <input
                        type="number" step="0.01" placeholder="0.00"
                        value={ttcDisplay}
                        onChange={handleTTCChange}
                        onBlur={handleTTCBlur}
                        className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-emerald-50/30"
                      />
                      <p className="text-[10px] text-emerald-600 mt-1">= HT × (1 + TVA/100)</p>
                    </div>
                  </div>

                  {/* TVA select */}
                  <div className="mb-1">
                    <label className="block text-xs font-600 text-muted-foreground mb-1.5">TVA applicable</label>
                    <select
                      {...register('tva', { valueAsNumber: true })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
                    >
                      <option value={0}>0% — Exonéré</option>
                      <option value={5.5}>5,5% — Alimentaire / livres</option>
                      <option value={8.5}>8,5% — Saint-Martin (taux local)</option>
                      <option value={10}>10% — Restauration / travaux</option>
                      <option value={20}>20% — Taux normal</option>
                    </select>
                  </div>

                  {/* KPI strip — 4 colonnes */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-white rounded-lg px-3 py-2.5 border border-border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">PV TTC</p>
                      <p className="text-base font-700 tabular-nums text-foreground mt-0.5">{sellPriceTTC.toFixed(2)} €</p>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2.5 border border-border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Marge brute</p>
                      <p className={`text-base font-700 tabular-nums mt-0.5 ${marginAmount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{marginAmount.toFixed(2)} €</p>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2.5 border border-border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Taux de marque</p>
                      <p className={`text-base font-700 tabular-nums mt-0.5 ${tauxDeMarque >= 50 ? 'text-emerald-600' : tauxDeMarque >= 20 ? 'text-amber-500' : 'text-red-500'}`}>{tauxDeMarque.toFixed(1)}%</p>
                      <p className="text-[9px] text-muted-foreground">MB / PV HT</p>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2.5 border border-border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Taux de marge</p>
                      <p className={`text-base font-700 tabular-nums mt-0.5 ${tauxDeMarge >= 50 ? 'text-emerald-600' : tauxDeMarge >= 20 ? 'text-amber-500' : 'text-red-500'}`}>{tauxDeMarge.toFixed(1)}%</p>
                      <p className="text-[9px] text-muted-foreground">MB / Coût revient</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STOCK TAB */}
            {activeTab === 'stock' && (
              <div className="space-y-4">
                {/* Stock status banner */}
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${stockStatus.color}`}>
                  <Icon name={quantityAvailable === 0 ? 'ExclamationCircleIcon' : quantityAvailable <= minStock ? 'ExclamationTriangleIcon' : 'CheckCircleIcon'} size={18} />
                  <div>
                    <p className="text-sm font-700">{stockStatus.label}</p>
                    <p className="text-xs mt-0.5">
                      {quantityAvailable === 0
                        ? 'Aucun stock disponible — produit en rupture'
                        : quantityAvailable <= minStock
                        ? `Stock sous le seuil minimum (${minStock} unités)`
                        : `${quantityAvailable} unités disponibles — stock suffisant`}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Quantité disponible */}
                  <div>
                    <label className="block text-sm font-600 text-foreground mb-1">
                      Quantité disponible <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-muted-foreground mb-1.5">
                      Stock actuel en boutique
                    </p>
                    <input
                      {...register('quantityAvailable', { valueAsNumber: true, min: 0 })}
                      type="number"
                      min={0}
                      placeholder="0"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Ex : 5 pièces en stock → saisir 5
                    </p>
                  </div>

                  {/* Stock minimum */}
                  <div>
                    <label className="block text-sm font-600 text-foreground mb-1">Stock minimum</label>
                    <p className="text-xs text-muted-foreground mb-1.5">Alerte déclenchée sous ce seuil</p>
                    <input
                      {...register('minStock', { valueAsNumber: true, min: 0 })}
                      type="number"
                      min={0}
                      placeholder="5"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                </div>

                {/* Stock comparison table */}
                <div className="bg-muted/30 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-700 text-foreground mb-2">Analyse du stock</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg px-3 py-2.5 border border-border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Stock actuel</p>
                      <p className={`text-xl font-700 tabular-nums mt-0.5 ${quantityAvailable === 0 ? 'text-red-600' : quantityAvailable <= minStock ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {quantityAvailable}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2.5 border border-border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Stock minimum</p>
                      <p className="text-xl font-700 tabular-nums mt-0.5 text-foreground">{minStock}</p>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2.5 border border-border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Écart</p>
                      <p className={`text-xl font-700 tabular-nums mt-0.5 ${quantityAvailable - minStock >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {quantityAvailable - minStock >= 0 ? '+' : ''}{quantityAvailable - minStock}
                      </p>
                    </div>
                  </div>

                  {/* Status legend */}
                  <div className="mt-3 space-y-1.5">
                    {[
                      { condition: quantityAvailable === 0, label: '🔴 Rupture', desc: 'Stock = 0 — produit indisponible' },
                      { condition: quantityAvailable > 0 && quantityAvailable <= minStock, label: '🟡 Stock faible', desc: `Stock ≤ minimum (${minStock})` },
                      { condition: quantityAvailable > minStock, label: '🟢 Stock OK', desc: `Stock > minimum (${minStock})` },
                    ].map((s, i) => (
                      <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${s.condition ? 'bg-white border border-border font-600' : 'opacity-40'}`}>
                        <span>{s.label}</span>
                        <span className="text-muted-foreground">{s.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1">Emplacement en magasin</label>
                  <p className="text-xs text-muted-foreground mb-1.5">Rayon, étagère, bac…</p>
                  <input {...register('location')} placeholder="Ex : Rayon A3 — Étagère 2" className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                </div>

                {/* Info about sync */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Icon name="InformationCircleIcon" size={18} className="text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-600 text-blue-800">Synchronisation automatique</p>
                      <p className="text-xs text-blue-700 mt-1">
                        La quantité saisie sera enregistrée directement dans le stock et synchronisée avec l'inventaire, la caisse et le dashboard. Chaque modification est tracée dans l'historique.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VARIANTS TAB */}
            {activeTab === 'variants' && (
              <div className="space-y-5">
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Icon name="SwatchIcon" size={18} className="text-violet-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-600 text-violet-800">Déclinaisons couleur avec suivi de stock</p>
                      <p className="text-xs text-violet-700 mt-1">Chaque couleur ajoutée crée automatiquement une entrée de stock dédiée.</p>
                    </div>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-700 text-foreground">Ajouter une couleur</h3>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Couleurs prédéfinies</p>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((pc) => (
                        <button key={`preset-${pc.name}`} type="button" onClick={() => handlePresetColor(pc.name, pc.hex)} title={pc.name} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-500 transition-all hover:shadow-sm ${newColorName === pc.name ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                          <span className="w-3.5 h-3.5 rounded-full border border-border/50 shrink-0" style={{ backgroundColor: pc.hex }} />
                          {pc.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1">Nom de la couleur *</label>
                      <input type="text" value={newColorName} onChange={(e) => setNewColorName(e.target.value)} placeholder="Ex : Rose Nude" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1">Couleur (hex)</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={newColorHex} onChange={(e) => setNewColorHex(e.target.value)} className="w-10 h-9 rounded-lg border border-border cursor-pointer p-0.5" />
                        <input type="text" value={newColorHex} onChange={(e) => setNewColorHex(e.target.value)} placeholder="#FFB6C1" className="flex-1 px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1">Quantité initiale</label>
                      <input type="number" min={0} value={newColorQty} onChange={(e) => setNewColorQty(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-600 text-muted-foreground mb-1">Stock minimum</label>
                      <input type="number" min={0} value={newColorMin} onChange={(e) => setNewColorMin(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={handleAddColor} disabled={!newColorName.trim()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity disabled:opacity-40 active:scale-95">
                      <Icon name="PlusIcon" size={14} />
                      Ajouter cette couleur au stock
                    </button>
                    <span className="text-xs text-muted-foreground">{colorVariants.length}/60 déclinaisons</span>
                  </div>
                </div>
                {colorVariants.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-700 text-foreground">Couleurs enregistrées <span className="ml-2 text-xs font-500 text-muted-foreground">({colorVariants.length} couleur{colorVariants.length > 1 ? 's' : ''})</span></h3>
                      <span className="text-xs text-muted-foreground">Stock total : {colorVariants.reduce((sum, cv) => sum + cv.quantity, 0)} unités</span>
                    </div>
                    <div className="space-y-2">
                      {colorVariants.map((cv) => (
                        <div key={cv.id} className="flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-3">
                          {editingVariantId === cv.id ? (
                            <>
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <input type="color" value={editDraft.colorHex} onChange={(e) => setEditDraft((d) => ({ ...d, colorHex: e.target.value }))} className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5 shrink-0" />
                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                  <input type="text" value={editDraft.colorName} onChange={(e) => setEditDraft((d) => ({ ...d, colorName: e.target.value }))} placeholder="Nom couleur" className="px-2 py-1 border border-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-full" />
                                  <input type="text" value={editDraft.colorHex} onChange={(e) => setEditDraft((d) => ({ ...d, colorHex: e.target.value }))} placeholder="#000000" className="px-2 py-1 border border-border rounded-lg text-xs font-mono focus:outline-none w-full" />
                                </div>
                              </div>
                              <div className="flex flex-col items-center gap-0.5">
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Qté</label>
                                <input type="number" min={0} value={cv.quantity} onChange={(e) => handleColorQtyChange(cv.id, Number(e.target.value))} className="w-16 px-2 py-1 border border-border rounded-lg text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                              </div>
                              <div className="flex flex-col items-center gap-0.5">
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Min</label>
                                <input type="number" min={0} value={cv.minStock} onChange={(e) => handleColorMinChange(cv.id, Number(e.target.value))} className="w-16 px-2 py-1 border border-border rounded-lg text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                              </div>
                              <button type="button" onClick={() => confirmEditVariant(cv.id)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors" title="Confirmer">
                                <Icon name="CheckIcon" size={14} />
                              </button>
                              <button type="button" onClick={cancelEditVariant} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" title="Annuler">
                                <Icon name="XMarkIcon" size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="w-8 h-8 rounded-lg border border-border/50 shrink-0 shadow-sm" style={{ backgroundColor: cv.colorHex }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-600 text-foreground">{cv.colorName}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{cv.colorHex}</p>
                              </div>
                              <div className="flex flex-col items-center gap-0.5">
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Qté</label>
                                <input type="number" min={0} value={cv.quantity} onChange={(e) => handleColorQtyChange(cv.id, Number(e.target.value))} className="w-16 px-2 py-1 border border-border rounded-lg text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                              </div>
                              <div className="flex flex-col items-center gap-0.5">
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Min</label>
                                <input type="number" min={0} value={cv.minStock} onChange={(e) => handleColorMinChange(cv.id, Number(e.target.value))} className="w-16 px-2 py-1 border border-border rounded-lg text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                              </div>
                              <div className={`px-2 py-1 rounded-md text-xs font-600 ${cv.quantity === 0 ? 'bg-red-100 text-red-700' : cv.quantity <= cv.minStock ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {cv.quantity === 0 ? 'Rupture' : cv.quantity <= cv.minStock ? 'Bas' : 'OK'}
                              </div>
                              <button type="button" onClick={() => startEditVariant(cv)} className="p-1.5 rounded-lg hover:bg-blue-50 text-muted-foreground hover:text-blue-600 transition-colors" title="Modifier cette couleur">
                                <Icon name="PencilIcon" size={14} />
                              </button>
                              <button type="button" onClick={() => handleRemoveColor(cv.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors" title="Supprimer cette couleur">
                                <Icon name="TrashIcon" size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                      <Icon name="SwatchIcon" size={22} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm font-500 text-foreground">Aucune couleur ajoutée</p>
                    <p className="text-xs text-muted-foreground max-w-xs">Ajoutez des couleurs ci-dessus pour créer des entrées de stock individuelles par couleur.</p>
                  </div>
                )}
              </div>
            )}

            {/* ADVANCED TAB */}
            {activeTab === 'advanced' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  {[
                    { id: 'shopify', field: 'shopify', label: 'Visible sur Shopify', desc: 'Synchroniser ce produit avec la boutique en ligne Shopify' },
                    { id: 'sellable', field: 'sellable', label: 'Produit vendable', desc: 'Ce produit peut être ajouté au panier en caisse' },
                    { id: 'reservable', field: 'reservable', label: 'Réservable', desc: 'Les clients peuvent réserver ce produit avec un acompte' },
                  ].map((opt) => (
                    <div key={opt.id} className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted/20 transition-colors">
                      <div>
                        <p className="text-sm font-600 text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" {...register(opt.field as keyof ProductFormData)} className="sr-only peer" />
                        <div className="w-10 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                  ))}
                </div>
                <div className="border border-red-200 rounded-xl p-4 bg-red-50">
                  <p className="text-sm font-600 text-red-800 mb-1">Zone dangereuse</p>
                  <p className="text-xs text-red-600 mb-3">La suppression d'un produit est irréversible et supprime tout l'historique associé.</p>
                  <button type="button" className="px-3 py-2 border border-red-300 rounded-lg text-xs font-600 text-red-700 hover:bg-red-100 transition-colors">
                    Supprimer ce produit définitivement
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sticky footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/10 shrink-0">
            {isDirty || colorVariants.length !== (product?.colorVariants?.length ?? 0) || imagePreview !== (product?.imageUrl ?? null) ? (
              <span className="text-xs text-amber-600 font-500 flex items-center gap-1.5">
                <Icon name="ExclamationCircleIcon" size={13} />
                Modifications en cours — cliquez sur Enregistrer
              </span>
            ) : <span className="text-xs text-emerald-600 font-500 flex items-center gap-1.5">
              <Icon name="CheckCircleIcon" size={13} />
              {product ? 'Fiche produit synchronisée' : 'Prêt à créer'}
            </span>}
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">Annuler</button>
              <button type="submit" disabled={loading} className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-50 active:scale-95" style={{ minWidth: 150 }}>
                {loading ? (
                  <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />{imageFile ? 'Upload image…' : 'Enregistrement…'}</>
                ) : (
                  <><Icon name="CheckIcon" size={14} />{product ? 'Mettre à jour' : 'Créer le produit'}</>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}