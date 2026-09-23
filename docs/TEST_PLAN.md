# Plan de tests & recette — TeslaMateFix

> Mise à jour : **2026-09-23** (v0.7.0). Priorités d'automatisation reprises dans
> [`ROADMAP.md`](ROADMAP.md).

TeslaMateFix **écrit dans la base de production de TeslaMate**. La recette
d'écriture se fait **toujours sur une base sauvegardée ou une copie jetable**.

---

## 1. Couverture automatisée actuelle

### Tests unitaires — Vitest (`tests/unit/`, 129 tests)

| Fichier | Tests | Cible |
|---|---|---|
| `charges.test.ts` | 49 | Règles d'intégrité charges (`src/lib/integrity/charges.ts`) : recalcul depuis les ticks, énergie, SOC, « appliquer à tous les ticks » |
| `datetime.test.ts` | 21 | Conversions UTC ↔ fuseau affiché |
| `drives.test.ts` | 19 | Haversine, dénivelés, recalcul, **correction v0.7.0** (`computeDriveCorrection`, `selectTrailingToAbsorb`) |
| `charge-cost.test.ts` | 9 | Coût depuis le tarif de géofence (`per_kwh`, `per_minute`, frais, arrondi) |
| `auth.test.ts` | 12 | Vérification login, bcrypt, comparaison à temps constant |
| `drive-synth.test.ts` | 6 | Synthèse des positions de l'assistant de création de trajet |
| `nearest-by-date.test.ts` | 6 | `pickNearestByDate` (capacité batterie datée) |
| `states.test.ts` | 4 | `closePreviousOpenState` |
| `settings.test.ts` | 3 | `updateSettings` : update seulement, jamais create/upsert |

### E2E — Playwright (`e2e/`)

- `login-edit-drive.spec.ts` : redirection vers `/login` → connexion → dashboard →
  ouverture du dernier trajet → déconnexion. **Non destructif.**
- Chromium uniquement ; `E2E_BASE_URL` pour viser une instance déjà démarrée ;
  identifiants `E2E_USERNAME` / `E2E_PASSWORD` (défaut `admin/admin`).

### Commandes

```bash
npm test                 # Vitest
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint (3 problèmes connus, cf. ROADMAP v0.7.1)
AUTH_SECRET=<≥32 caractères> DATABASE_URL=postgresql://u:p@localhost:5432/db \
  npm run build          # valeurs factices suffisantes pour le build
npm run test:e2e         # nécessite un build + une base accessible
```

> La CI (`.github/workflows/docker-publish.yml`) **ne lance aucun de ces
> contrôles** : elle construit et pousse l'image sur un tag. Les lancer à la main
> avant chaque tag.

---

## 2. Pré-requis de recette

- [ ] `pg_dump` de la base TeslaMate (ou restauration dans une base de test).
- [ ] `.env` renseigné (`DATABASE_URL`, auth, `TZ`/fuseau ; optionnel : variables
      Fleet API et géo).
- [ ] Serveur lancé **par toi** (`npm run dev` pour voir les logs, ou image Docker
      `wkerkeni/teslamatefix:<version>`).
- [ ] Noter quelques IDs de test : un trajet sain, un trajet non fermé ou en
      anomalie, une charge AC, une charge DC, une période avec positions.

---

## 3. Recette manuelle par écran

### 3.1 Authentification & shell

- [ ] Route protégée sans session → `/login?from=…`, puis retour à la page demandée.
- [ ] Mauvais mot de passe → erreur ; tentatives répétées → limite de débit.
- [ ] `from=//evil.com` ignoré (pas de redirection externe).
- [ ] Changement de mot de passe (`/change-password`) puis reconnexion.
- [ ] Déconnexion → `/login`.
- [ ] Sélecteur de fuseau horaire (en-tête) : les dates affichées changent, les
      valeurs en base restent en UTC.
- [ ] Thème clair / sombre / système ; menu burger sur mobile ; bascule FR / EN.

### 3.2 Dashboard (`/`)

- [ ] Bloc STATUS : infos véhicule + photo officielle (ou message explicite si les
      variables d'env manquent) ; slider multi-vues.
- [ ] Version du firmware avec lien vers notateslaapp.
- [ ] Liste des anomalies cohérente avec les pages trajets/charges.
- [ ] Raccourcis « dernier trajet / dernière charge » fonctionnels.

### 3.3 Charges (`/charges`, `/charges/[id]`, `/charges/new`)

- [ ] Listing : pagination serveur, filtres, colonnes.
- [ ] Édition : blocs **Temps** et **Énergie** (ajoutée / consommée / coût) en
      premier ; modification + enregistrement ; valeurs relues correctement.
- [ ] Onglet Mesures : 22 colonnes de ticks ; « appliquer à tous les ticks »
      propage aussi au premier tick.
- [ ] Recalcul depuis les ticks : aperçu avant/après puis application.
- [ ] Assistant de création : pré-remplissage V/phases/A selon le type (AC 11 kW :
      240 V / 2 ph / 16 A ; AC 7 kW : 240 V / 1 ph / 32 A ; DC : tension et
      courant laissés vides).
- [ ] Carte de localisation + géofence.
- [ ] Mode `READ_ONLY=true` : toute écriture refusée avec un message.
- [ ] Listing : la date de début ouvre l'édition ; pas de colonne d'actions.
- [ ] Session ouverte antérieure (ex. 248/251) : n'empêche plus de modifier les
      dates d'une charge postérieure ; un vrai chevauchement affiche la session en
      conflit (#id + bornes).
- [ ] Coût : modifier l'énergie consommée ou ajoutée → coût recalculé avec le
      tarif de la géofence (aide affichée sous le champ) ; changer de géofence →
      nouveau tarif ; géofence sans tarif ou absente → aide « saisie manuelle » ;
      tarif à la minute → recalcul quand les dates changent.
- [ ] SOC : modifier le % de départ / d'arrivée → autonomies idéale et rated
      remplies ; historique insuffisant → avertissement.
- [ ] Ouvrir une charge sans rien toucher → aucune valeur écrasée.

### 3.4 Trajets — listing (`/drives`)

- [ ] Colonnes façon Grafana (% batterie, vitesse moyenne, écart d'autonomie, ❄,
      efficacité / conso).
- [ ] Filtres : distance min, vitesse moyenne min, géofence (départ **ou**
      arrivée), texte de localisation, dates, « non fermés seulement ».
- [ ] Unités conformes aux paramètres TeslaMate (km/mi, °C/°F, ideal/rated).
- [ ] Menu « Colonnes » : choix mémorisé après rechargement.
- [ ] Liens date / départ / arrivée vers le trajet, l'adresse ou la géofence.
- [ ] Pagination et total exacts.

### 3.5 Trajets — édition (`/drives/[id]`)

- [ ] Layout deux colonnes (desktop), empilé (mobile).
- [ ] Carte : départ vert, arrivée rouge, tracé complet, cadrage auto ; colorisation
      Trajet / Puissance / Vitesse.
- [ ] Énergie consommée estimée mise à jour en direct.
- [ ] Barre d'actions flottante : Enregistrer / Annuler / Corriger / Supprimer.
- [ ] Trajet **sain** : pas de bandeau d'anomalie.
- [ ] Trajet **en anomalie** (non fermé, odomètre d'arrivée manquant, positions
      après la fin, distance nulle) : bandeau affiché.
- [ ] « Corriger » : popin calculée à l'ouverture, aperçu avant/après ; Appliquer →
      trajet mis à jour, positions orphelines rattachées (`drive_id`), page
      rafraîchie.
- [ ] Les dialogues passent au-dessus de la carte (pas de problème de z-index).
- [ ] ⚠️ Avec `READ_ONLY=true`, la correction **écrit quand même** (comportement
      connu, cf. SECURITY_REVIEW) — le vérifier et le noter.

### 3.6 Trajets — assistant de création (`/drives/new`)

- [ ] Départ / arrivée : recherche dans les adresses connues.
- [ ] Aucun résultat → « Créer une nouvelle adresse » → propositions Nominatim avec
      numéros de rue → adresse créée et sélectionnée (pas de doublon
      `osm_id/osm_type`).
- [ ] Géofence auto-sélectionnée quand l'adresse est dans une zone.
- [ ] Date de départ obligatoire, non pré-remplie.
- [ ] **Chemin automatique** : une position existe avant la date → état de départ
      repris ; Calculer → itinéraire, positions (~1 / 30 s), infos d'arrivée.
- [ ] **Chemin manuel** : aucune position antérieure → saisie odomètre / batterie /
      température ; autonomies remplies depuis le % ; bouton Calculer de la
      section → « Créer le trajet » activé.
- [ ] Champs du résumé modifiables ; valeurs saisies bien enregistrées.
- [ ] Sauvegarde : trajet + positions insérés, `start/end_position_id` renseignés
      (vérifier en SQL).
- [ ] Géocodeur / routeur injoignable → message d'erreur clair, rien d'écrit.

### 3.7 Positions (`/positions`)

- [ ] Sans paramètre : 7 derniers jours, chargement par lots (compteur).
- [ ] Menu des plages rapides (Relatives / Journée / En cours / Précédentes) : URL
      `?qr=…` mise à jour, carte et tableau rechargés ; dates manuelles →
      « Personnalisé ».
- [ ] Liste des trajets remplie au fil des lots, ordre chronologique, scroll interne.
- [ ] Cases à cocher : masquage instantané ; « hors trajet », « tout / aucun » ;
      pastille = couleur de la trace.
- [ ] Changement de plage pendant un chargement : l'ancien chargement s'arrête.
- [ ] Plafond de points atteint → « charger plus ».
- [ ] Plage > 31 jours : carte complète, tableau limité (message `map.tableLimited`).
- [ ] Tableau : tous les champs, sélection multiple, suppression en masse.
- [ ] Édition d'une position (`/positions/[id]`).

### 3.8 Autres entités

- [ ] Adresses, géofences, états, mises à jour : listing + fiche s'affichent, les
      valeurs numériques et les libellés des listes déroulantes sont corrects
      (régression de l'audit `AUDIT_NAV.md`).
- [ ] `/cars` : lecture seule, onglet Options.
- [ ] `/settings` : modification d'un paramètre, jamais de création de ligne.

### 3.9 Intégration & déploiement

- [ ] `GET /api/health` → 200 sans authentification ; `/api/health/db` exige une
      session.
- [ ] `/.well-known/appspecific/com.tesla.3p.public-key.pem` sert la clé montée
      (`TESLA_PUBLIC_KEY_FILE`), accessible sans authentification.
- [ ] Image Docker : démarre en `USER node`, volume `/data` inscriptible (cache
      photo), healthcheck vert.
- [ ] Image multi-arch : `docker manifest inspect` → linux/amd64 + linux/arm64.

---

## 4. Non-régression données (à vérifier en SQL après la recette d'écriture)

- [ ] Aucune écriture dans `private.tokens` ; `schema_migrations` inchangée.
- [ ] Pas de trajet ou de charge orphelin (FK `car_id`, `*_position_id`,
      `*_address_id`, `*_geofence_id` valides).
- [ ] Valeurs dénormalisées cohérentes après correction : `drives.distance` ≈
      `end_km - start_km`, `duration_min` ≈ écart des dates ;
      `charging_processes.charge_energy_added` cohérent avec les ticks.
- [ ] Toutes les dates stockées en UTC.
- [ ] `READ_ONLY=true` : aucune écriture, **sauf** la correction de trajet (connu).

---

## 5. Trous de couverture — tests à écrire (priorisés)

| Prio | Cible | Type | Pourquoi |
|---|---|---|---|
| P1 | `applyCorrectDriveAction` / `applyDriveCorrection` | unitaire, Prisma mocké | Écrit `drives` + `positions`, contourne `READ_ONLY`, payload client non revalidé |
| P1 | Server actions d'écriture (drives, charges, positions) : garde `READ_ONLY`, rejet Zod | unitaire | Aucun test aujourd'hui sur les actions |
| P2 | `src/lib/positions/quick-ranges.ts` (`computeQuickRange`) | unitaire | Pur, logique de dates délicate (fuseau, bornes de semaine/mois) |
| P2 | `src/lib/positions/map-points.ts` (groupage, sous-échantillonnage, couleurs) | unitaire | Pur, facile à couvrir |
| P2 | `src/lib/units.ts`, `src/lib/format/duration.ts` | unitaire | Purs, utilisés partout dans le listing |
| P2 | `src/lib/geo/*` (Nominatim, OSRM, géofence) | unitaire, `fetch` mocké | Dépendance externe, gestion d'erreurs |
| P2 | `src/lib/drives/list-query.ts` | intégration (base de test) | SQL brut, filtres combinés |
| P2 | E2E lecture : `/drives` + filtres, `/positions` + plage rapide, `/charges/[id]` | Playwright | Écrans les plus utilisés |
| P3 | E2E écriture : création de trajet, correction, édition de charge | Playwright + base jetable | Nécessite une fixture de base restaurable |
| P3 | CI : `test` + `typecheck` + `lint` avant `docker-publish` | GitHub Actions | Empêche de publier une image cassée |
