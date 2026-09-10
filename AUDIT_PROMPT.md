# PROMPT — AUDIT & CORRECTION COMPLÈTE APPLICATION ENTREPRISE

Utilise ce prompt au début d'une session pour lancer un audit complet avant livraison.

---

## COMMANDE

```
FAIT UN AUDIT COMPLET ET CORRIGE TOUS LES PROBLÈMES DE CETTE APPLICATION.
L'objectif est qu'elle soit 100% utilisable en production dans une entreprise,
sans crash, sans faille, sans donnée perdue.

Suis exactement ce protocole en 5 phases :

---

PHASE 1 — SÉCURITÉ (critique, à corriger en priorité absolue)

Vérifie et corrige :
- Toutes les routes API PATCH/POST/DELETE : y a-t-il un whitelist des champs acceptés ?
  (sinon un utilisateur peut écrire dans loyalty_points, store_credit, etc.)
- Les routes d'administration : sont-elles protégées par un secret ou une session admin ?
- Les tokens/secrets dans le code : y a-t-il des fallbacks codés en dur ?
- Les entrées utilisateur : sont-elles validées avant d'aller en base ?
  (types, fourchettes, formats — ex: quantités négatives, montants < 0)
- Les opérations financières : sont-elles rejouables sans dupliquer la donnée ?
  (idempotency guards sur les tickets, les mouvements de stock, les webhooks)

---

PHASE 2 — INTÉGRITÉ DES DONNÉES (aucune donnée perdue, aucune incohérence)

Vérifie et corrige :
- Les opérations en plusieurs étapes : si l'étape 2 échoue, l'étape 1 est-elle annulée ?
  Ex: déduire des points AVANT de créer le record → si l'insert échoue, les points sont perdus
  → Règle : créer le record EN PREMIER, modifier la donnée financière EN SECOND
- Les suppressions : vérifie les dépendances avant delete
  Ex: supprimer un avoir déjà utilisé en caisse = incohérence comptable
  → Règle : bloquer la suppression si la donnée est referenced/utilisée ailleurs
- Les annulations : quand on annule (ticket, réservation, retour), tous les effets sont-ils inversés ?
  Stock remis + points fidélité annulés + crédit boutique recredité
- Les race conditions : deux requêtes simultanées peuvent-elles corrompre un stock ou un solde ?
  → Utilise des guards d'idempotency (30s window, unique constraint DB, optimistic lock)
- Les comparaisons de montants : utilise Math.round(x * 100) pour comparer en centimes,
  jamais de > totalAmount + 0.01 (erreurs float imprévisibles)

---

PHASE 3 — ROBUSTESSE FRONTEND (aucun crash, aucun blocage utilisateur)

Vérifie et corrige :
- Les variables utilisées dans une fonction mais définies plus bas dans le fichier
  → Recalcule-les localement dans la fonction pour éviter les closures ambiguës
- Les boutons d'action irréversible sans confirmation
  Ex: "Réceptionner", "Supprimer", "Annuler commande" → window.confirm() obligatoire
- Les boutons de soumission de formulaire sans état "loading" (disabled pendant l'envoi)
  → Risque de double soumission = double commande, double paiement
- Les fetch() sans .catch() → silently fails, l'utilisateur pense que ça a marché
  → Remplace tous les .catch(() => {}) par .catch((e) => console.error('[contexte]', e.message))
- Les erreurs non affichées à l'utilisateur : toast/banner d'erreur obligatoire sur les actions critiques

---

PHASE 4 — LOGIQUE MÉTIER (les flux doivent être complets et corrects)

Vérifie et corrige dans cet ordre :
1. Flux stock : création produit → réception fournisseur → vente → retour → audit
   - La formule d'audit doit être : stock attendu = stock avant réception + reçu - vendu depuis + ajustements manuels
   - Les webhooks (Shopify, etc.) ne doivent pas déduire 2x si rejoués
2. Flux caisse : ouverture session → vente (CB, espèces, mixte) → clôture → écart
   - La portion espèces doit gérer tous les formats (Espèces/cash/Mixte/mixte|CB|cash) sans casse sensible
3. Flux paiement réservation : acompte → solde → complétion → déduction stock
   - Le stock doit être déduit AVANT de marquer completed (paiement déjà reçu)
4. Flux fidélité : accumulation points → échange → déduction
   - Créer l'échange EN PREMIER, déduire les points EN SECOND (jamais l'inverse)
5. Flux livraison/expédition : création → assignation livreur → notification → livré

---

PHASE 5 — NETTOYAGE FINAL

- Lance le compilateur TypeScript (npx tsc --noEmit) et corrige toutes les erreurs
- Vérifie que les erreurs pré-existantes non liées à tes corrections sont documentées
- Liste toutes les migrations SQL nécessaires avec du SQL propre (sans markdown)
- Documente ce qui nécessite une action manuelle (migration DB, variable d'env)

---

FORMAT DE RÉPONSE ATTENDU

Pour chaque problème trouvé :
FICHIER: src/app/api/...
PROBLÈME: [description courte]
RISQUE: [critique / élevé / moyen]
CORRECTION: [appliquée dans le code]

Puis en fin de session :
- Liste des migrations SQL à lancer (SQL pur, sans tiret ni markdown)
- Liste des variables d'environnement à configurer
- Liste des actions manuelles restantes

NE JAMAIS TOUCHER SXM SANS CONFIRMATION EXPLICITE.
Toujours MQ en premier, SXM après validation.
```

---

## CHECKLIST RAPIDE (avant chaque déploiement)

```
[ ] npx tsc --noEmit → 0 erreur nouvelle
[ ] Toutes les routes PATCH ont un whitelist de champs
[ ] Toutes les routes admin ont un guard (requireAdminSecret)
[ ] Tous les flux en 2 étapes : record créé AVANT la modification financière
[ ] Toutes les annulations inversent stock + points + crédit
[ ] Tous les boutons irréversibles ont un window.confirm()
[ ] Tous les boutons de formulaire sont disabled pendant le chargement
[ ] Migrations SQL préparées en SQL pur (sans markdown)
[ ] Variables d'env vérifiées sur Vercel
```

---

## MIGRATIONS SQL — FORMAT CORRECT

Toujours fournir comme ça (SQL pur, collable directement) :

```sql
ALTER TABLE nom_table
  ADD COLUMN IF NOT EXISTS colonne_1 type DEFAULT valeur,
  ADD COLUMN IF NOT EXISTS colonne_2 type DEFAULT valeur;
```

JAMAIS avec des tirets de liste markdown devant — ça casse le parser SQL.
