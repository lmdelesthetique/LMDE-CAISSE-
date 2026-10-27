# LMDE CAISSE — Documentation complète
**Le Monde de l'Esthétique — Logiciel de caisse & gestion**
Dernière mise à jour : 7 octobre 2026

---

## Stack technique

| | |
|--|--|
| Framework | Next.js 15.1.11 (App Router) |
| Base de données | Supabase (PostgreSQL) — plan Pro |
| Auth | PIN session (cookie `app_session`, TTL 8h) |
| Déploiement | Vercel — auto-deploy sur push `main` |
| Domaine | www.lmdecaisse.com |
| Style | Tailwind CSS + variables CSS custom |
| Port local dev | 4028 (`next dev -p 4028`) |

## Règles absolues

- **Toutes les écritures DB passent par des routes API** avec la clé `SUPABASE_SERVICE_ROLE_KEY` (client admin). Le client anon Supabase ne doit JAMAIS être utilisé pour des mutations — il retourne `null` silencieusement à cause des RLS.
- **`createAdminClient()`** = client service role (server-side uniquement, dans les routes API).
- **`createClient()`** = client anon (lecture publique uniquement, usage limité).
- Les pages Next.js sont toutes `'use client'` — elles fetchent des API routes, jamais Supabase directement.

## Variables d'environnement requises

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL            # https://www.lmdecaisse.com
NEXT_PUBLIC_WHATSAPP_NUMBER
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID        # 1173965989131540
WHATSAPP_BUSINESS_ID
WHATSAPP_VERIFY_TOKEN
OPENAI_API_KEY
ANTHROPIC_API_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
BREVO_API_KEY
BREVO_SENDER_EMAIL
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
SHOPIFY_STORE_DOMAIN
SHOPIFY_LOCATION_ID
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
```

---

## Modules de l'application

### 1. Caisse / POS (`/pos-sales-terminal`)
Terminal de vente principal.
- Vente de produits avec recherche, scan code-barres
- Paiements : CB, espèces, SumUp, virement, avoir (store credit)
- Paiement mixte : `Mixte|<autres>|<especes>`
- Fidélité : points et remises automatiques au scan client
- Favoris POS (`/api/pos-favourites`)
- Historique des actions (`/api/pos-action-log`)
- Promotions appliquées automatiquement
- Génération ticket de caisse (PDF jsPDF)
- Push notifications admin sur vente

### 2. Clients (`/clients`)
Base clients complète — 3500+ clients.
- **Fetch** : `GET /api/clients?full=true` — pagine automatiquement par 1000 pour tout retourner
- **mapClient()** dans `clientService.ts` accepte snake_case ET camelCase
- Filtres : type (particulier/pro/VIP/abonné/non abonné), recherche texte
- Vue grille et liste
- Relances clients : soldes impayés, anniversaires, devis en attente (`/api/clients/reminders`)
- Fiche client complète : achats, fidélité, notes internes, abonnement, parrainage
- Flags pays avec emoji 🇲🇶🇬🇵🇫🇷 etc.
- Numéros WhatsApp normalisés via `normalizePhone()` (Martinique = +596)

### 3. Devis Pro (`/devis-pro`)
Système de devis pour clients professionnels.

**Statuts** : `brouillon → envoye → client_valide / client_modifie → pret → livre → annule`

**Fonctionnalités** :
- Création avec produits recherchés en temps réel
- Remise globale (%) + remises par article (0/5/10/15/% libre) — ajouté oct 2026
- Bonus Budget Pro (paliers de crédit offert sur commande)
- PDF généré côté client (jsPDF + jspdf-autotable) avec images produits
- Envoi WhatsApp avec PDF uploadé en Supabase Storage
- Token client pour portail devis (`/devis/[token]`)
- Réponse client : acceptation ou modification avec recalcul automatique
- Templates de devis sauvegardés (DB + localStorage)
- Auto-relance configurable (`date_reassort` + cron Vercel)
- Création automatique facture/reçu + déstockage au statut `livre`
- Livraison : création automatique delivery pending au statut `pret`
- Suivi paiements multiples (`paiements[]` : CB/espèces/virement/avoir/SumUp)

**Routes API** :
- `GET/PATCH/DELETE /api/devis-pro/[id]`
- `POST /api/devis-pro`
- `GET/PATCH /api/devis/by-token/[token]` — portail client
- `GET/POST/PATCH/DELETE /api/devis-pro/templates`

### 4. Réservations (`/reservations`)
Gestion des commandes/réservations.
- Numérotation : `RES-YYYY-NNNNN`
- Suivi balance due / paiements
- Envoi facture WhatsApp
- Route : `/api/reservations`

### 5. Factures (`/facture`)
- PDF facture public accessible via token
- Route publique : `/facture/[id]`
- API : `/api/factures`

### 6. Abonnements Box Beauté (`/abonnements`)
- Abonnements mensuels avec box produits
- Portail client : `/client-portal`
- Confirmation commande → déstockage atomique avec rollback si échec
- Paiement Stripe
- Statuts : `open → confirmed → preparing → shipped → en_livraison → delivered`
- Route status : `PATCH /api/client-portal/subscription-order/status`

### 7. Stock (`/stock`)
- Gestion stock produits avec variantes couleur
- `syncColorStocksToTotal()` — synchronise stock total depuis variantes couleur
- Mouvements de stock loggués (`stock_movements_log`)
- Réassort suggéré
- Sync Shopify (`/shopify-sync`)

### 8. Produits (`/product-management`)
- Catalogue produits avec prix HT/TTC, TVA 8.5%
- Prix couleur par variante (`product_color_stock`)
- Historique changements prix
- Catégories hiérarchiques

### 9. Fidélité (`/loyalty`)
- Paliers : Bronze → Argent → Or → Platine
- Points sur achats, remises automatiques
- Avoir (store credit) : déductible au POS et devis
- Transactions : `/api/loyalty`

### 10. Ambassadrices (`/ambassadrices`)
- Programme ambassadrices avec commissions
- Campagnes marketing (`/campagnes-ambassadrices`)
- Portail ambassadrice : `/ambassadrice/[lienUnique]`
- Espace privé : `/espace-ambassadrice`

### 11. Parrainage (`/parrainage`)
- Code parrainage unique par client
- Crédits sur parrainage validé
- Route : `/api/referrals`

### 12. Livraisons (`/livraisons`)
- Gestion des livraisons avec chauffeurs
- Portail livreur : `/livreur` (auth cookie `livreur_session`)
- Statuts : pending → en_route → delivered
- Route : `/api/deliveries`

### 13. Fournisseurs (`/suppliers`)
- Commandes fournisseurs (`/commandes-fournisseurs`)
- Portail fournisseur : `/supplier-portal/[token]`
- Admin portail : `/supplier-portal-admin`
- Paiements fournisseurs, messages, réclamations

### 14. Marketing (`/marketing`)
- Campagnes WhatsApp Business API (Meta)
- Statut WhatsApp : `/whatsapp-status`
- Route : `/api/whatsapp`, `/api/marketing`

### 15. Rapports & Dashboard
- Dashboard principal : `/dashboard`
- Dashboard général : `/general-dashboard`
- Rapports : `/reports`
- Rapport TVA : `/vat-report`
- Clôture caisse : `/cloture-caisse`
- Réconciliation shift : `/shift-reconciliation`

### 16. Administration
- Config admin : `/admin-config`
- Employés : `/employees`
- Catégories : `/categories`
- Promotions : `/promotions`
- Backup compliance : `/backup-compliance`
- Inventaire : `/inventory`

---

## Architecture des données

### Tables Supabase principales
```
clients                 — Base clients (3500+)
products                — Catalogue produits
product_color_stock     — Variantes couleur avec stock
receipts                — Tickets de caisse
reservations            — Commandes/réservations
devis_pro               — Devis professionnels
subscriptions           — Abonnements box
subscription_orders     — Commandes box mensuelles
subscription_order_items— Articles des commandes box
deliveries              — Livraisons
employees               — Employés
loyalty_transactions    — Transactions fidélité
stock_movements_log     — Journal mouvements stock
push_subscriptions      — Abonnements notifications push
devis_pro_templates     — Templates de devis
client_pro_profiles     — Profils commerciaux clients pro
fo_orders               — Commandes fournisseurs
ambassadrices           — Programme ambassadrices
campagnes_ambassadrices — Campagnes marketing
```

### Helpers utilitaires
```
src/lib/supabase/admin.ts         — createAdminClient() service role
src/lib/supabase/client.ts        — createClient() anon
src/lib/utils/syncColorStock.ts   — syncColorStocksToTotal()
src/lib/utils/phoneUtils.ts       — normalizePhone() (+596 Martinique)
src/lib/services/clientService.ts — CRUD clients (mapClient snake+camel)
src/lib/services/reservationService.ts
```

---

## Middleware (`src/middleware.ts`)

- **Routes publiques** (pas de PIN) : `/pin-login`, `/api/auth/pin`
- **Portails isolés** (pas de PIN admin) : `/client-portal`, `/supplier-portal`, `/ambassadrice`, `/espace-ambassadrice`, `/depot-media`, `/public`, `/facture`, `/reservation`, `/box`, `/devis`
- **Portail livreur** : cookie `livreur_session`
- **Tout le reste** : cookie `app_session` (PIN 4 chiffres, TTL 8h)
- **Matcher** : exclut `_next/static`, `_next/image`, `favicon.ico`, `sw.js`, `manifest.json`, `icons`, `assets`, `api`

---

## Service Worker (`/public/sw.js`)

- Ne met PAS en cache les ressources JS (cache désactivé)
- Gère uniquement les **push notifications** (Web Push VAPID)
- Clique sur notification → ouvre l'URL correspondante

## Cache HTTP

Configuré dans `next.config.mjs` :
- Pages HTML : `no-cache, no-store, must-revalidate` (évite bundle JS périmé)
- Assets statiques `.next/static` : cache long terme (content-hashed)

---

## Corrections appliquées — Octobre 2026

### 7 octobre 2026
- **Noms clients vides** : `GET /api/clients` retournait camelCase (`firstName`) mais `mapClient()` lisait snake_case (`first_name`) → noms vides. Fix : route retourne snake_case brut, `mapClient()` accepte les deux formats, `clients/page.tsx` fetch directement avec `?full=true`.
- **Limite 200/500 clients** : route paginait à 200 par défaut. Fix : `?full=true` boucle par pages de 1000 jusqu'à tout retourner (3501 clients).
- **`npm start` = `next dev`** : le script `start` dans `package.json` pointait sur `next dev` au lieu de `next start`. Fix : `"start": "next start -p 4028"`.
- **Cache HTML 1 an** : `Cache-Control: s-maxage=31536000` empêchait le navigateur de charger le nouveau bundle JS. Fix : `no-cache` sur toutes les pages HTML.
- **Remises par article dans Devis Pro** : ajout d'un sélecteur de remise (0/5/10/15/% libre) par produit dans `ProDevisPanel`, reflété dans le PDF avec prix barré.

### Commits récents
```
dccc061  Fix client list truncated to 200/500 — fetch all 3000+ clients
df47cc8  Fix missing client names + production mode + item-level discounts
c4be02f  Fix 5 Devis Pro bugs: receipt prices, color stock, pdf_url, credit
4b3da6a  Sync color stock after box order confirmation/cancellation
73d20f3  Fix client page crash + relances + devis pro update flow
e81981b  Fix all medium/high-risk RLS silent failures
b26c1a6  Fix silent RLS failures: migrate 5 services to admin API routes
```

---

## Déploiement

**Production** : Vercel auto-deploy sur push `main`
```bash
git add . && git commit -m "message" && git push origin main
```
Vercel build (~2 min) puis live sur www.lmdecaisse.com.

**Local dev** :
```bash
npm run dev        # next dev -p 4028 (HMR actif)
npm run build      # compile production
npm start          # next start -p 4028 (prod local)
```

---

## Projet SXM (Saint-Martin)

Dépôt séparé : `LMDE-CAISSE-SXM-`
- URL : lmdecaissesxm.com
- Supabase **séparé** (ne jamais toucher MQ depuis SXM et vice versa)
- TVA différente
- Parrainage = crédits consommables (pas points)
- **Règle absolue** : ne jamais modifier MQ sans confirmation explicite de l'utilisateur

---

## Notes importantes

- `balance_due` est une **colonne générée** dans Supabase — ne pas l'écrire directement
- Les numéros Martinique commencent par `0696`/`0697` → WhatsApp links = `+596696...` (remplacer `0` par `+596`)
- Le `client_token` dans `devis_pro` est le token public pour le portail client
- `isBonus: true` sur un article devis = couvert par le Budget Pro, le client ne paie pas
- `paiements[]` dans devis_pro = tableau JSON des paiements multiples `{method, amount}`
- `payment_method` dans receipts format POS : `'especes'`, `'CB'`, `'SumUp'`, `'transfer'`, `'store_credit'`, ou `'Mixte|<autres>|<especes>'`
