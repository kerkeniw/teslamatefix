# Release v0.5.2 — checklist

> Document de suivi pour **TeslaMateFix v0.5.2**
> (« Photo officielle du véhicule dans le bloc STATUS »).

## État

- Branche : `release/0.5.2` (worktree dédié `../TeslaMateFix-0.5.2`).
- `package.json` version : `0.5.2`.
- Nature : **évolution mineure de code** (nouveau module `src/lib/tesla/` + split
  UI du bloc STATUS). Rebuild de l'image requis.

## Contexte

Le bloc STATUS de l'accueil n'affichait que du texte. On y ajoute la **photo
officielle Tesla** (rendu *compositor*, comme sur le site Tesla) à droite, les
infos restant à gauche. Les codes option qui composent l'URL proviennent de la
Fleet API et sont mis en cache.

## Périmètre validé

Inchangé depuis v0.3.0 : seuls **création + édition d'une charge** sont validés.
v0.5.2 ajoute un affichage en lecture seule, ne touche pas au scope d'édition.

## Nouveautés

### Photo officielle dans le bloc STATUS

- **`src/components/dashboard/dashboard.tsx`** — bloc hero divisé en deux colonnes
  (`grid md:grid-cols-2`) : infos + KPI à gauche, `<VehicleImage>` à droite.
- **`src/components/dashboard/vehicle-image.tsx`** — `<img>` natif (compositor déjà
  redimensionné, pas de CSP à contourner), `object-contain` pour tenir dans le bloc.
- **`src/lib/dashboard.ts`** — `DashboardData.car.imageUrl` résolu via
  `getVehicleImageUrl({ vin, model })`.
- **i18n** — clé `dashboard.vehicleImageAlt` (fr/en).

### Récupération des codes option + cache

- **`src/lib/tesla/vehicle-image.ts`** — orchestration par priorité : cache (mémoire
  + JSON `/data`, TTL 30 j — on mémorise **l'ENSEMBLE du payload API** et on en dérive
  les codes) → Fleet API (codes EXACTS) → repli `TESLA_VEHICLE_OPTIONS` → sinon **pas
  d'image**. **Aucun code option en dur.** `getVehicleImages()` génère **une URL par vue**
  (`VEHICLE_VIEWS` : FRONT34, SIDE, REAR34, RIMCLOSEUP, STUD_SEAT, INTERIOR_ROW2) pour le
  slider ; `context=design_studio_2`, `model` mappé S/3/X/Y → ms/m3/mx/my.
- **`src/components/dashboard/vehicle-image.tsx`** — carrousel client : autoplay (pause au
  survol), flèches `<`/`>` au survol, points ; une vue dont l'`<img>` échoue (ex.
  `INTERIOR_ROW2` selon la config) est retirée du carrousel.
- **`src/lib/tesla/fleet.ts`** — `GET /api/1/dx/vehicles/options?vin=` (timeout 3 s)
  renvoie le **payload JSON brut** ; `extractCodes()` (exporté) en dérive les codes,
  sur payload frais comme sur payload en cache.
- **`src/lib/tesla/token.ts`** — lecture **read-only** de `tokens`, schéma résolu
  dynamiquement (**`private`** récent / `public` ancien) puis requête qualifiée.
  Déchiffrement Cloak, **aucun refresh**. Warn unique par process si échec.
- **`src/lib/tesla/cloak.ts`** — déchiffrement AES-256-GCM façon `Cloak.Vault`
  (clé = `SHA256(ENCRYPTION_KEY)`, AAD `AES256GCM`, enveloppe `01 0a "AES.GCM.V1"`).

### Configuration (`.env.example`, tout optionnel)

- `TESLAMATE_ENCRYPTION_KEY` — **exactement** l'`ENCRYPTION_KEY` de TeslaMate (sinon
  déchiffrement KO → repli `TESLA_VEHICLE_OPTIONS`).
- `TESLA_FLEET_API_BASE_URL` — base régionale (EU par défaut).
- `TESLA_VEHICLE_OPTIONS` — **repli** quand l'API est inaccessible : codes exacts de la
  voiture (échapper les `$` → `\$`). Vide + API KO ⇒ pas d'image.

## Pièges / points d'attention

- ⚠️ **Photo EXACTE = Fleet API (ou `TESLA_VEHICLE_OPTIONS`)** : le compositor exige
  des jeux d'options complets/cohérents et des codes peinture liés à la génération →
  on ne peut pas reconstruire la config depuis les colonnes `cars`. On ne code donc
  **aucun** jeu de codes en dur : sans API ni env, pas d'image (colonne droite vide).
  `dx/vehicles/options` est un endpoint **Fleet API** : nécessite une instance
  TeslaMate migrée Fleet + scopes adéquats.
- ⚠️ **Token souvent indisponible en dev** : sur une base **restaurée** (snapshot),
  le token est périmé (TTL ~8 h) et la clé peut ne pas correspondre → déchiffrement
  KO → repli `TESLA_VEHICLE_OPTIONS`. La vraie photo n'apparaît qu'en prod (DB live,
  token frais, bonne `ENCRYPTION_KEY`), ou en collant les codes dans l'env.
- **Schéma `tokens`** : `private.tokens` (TeslaMate récent) résolu dynamiquement,
  requête qualifiée car `search_path = public`. Lue via `$queryRaw`, jamais écrite.
- **Ne jamais rafraîchir le token** : Tesla rotationne le refresh token à chaque
  refresh ; on lit l'access token et on l'utilise tel quel.
- **Cloak** : enveloppe `01 0a "AES.GCM.V1"` + IV + tag + ct, AAD `AES256GCM`, clé
  `SHA256(ENCRYPTION_KEY)` — format validé. Échec = mauvaise `TESLAMATE_ENCRYPTION_KEY`.

## Vérification

- [ ] `npm run typecheck` OK.
- [ ] `npm run lint` OK (pas de nouveau warning sur les fichiers `tesla/` ni dashboard).
- [ ] `npm run dev` → accueil : bloc STATUS en 2 colonnes.
- [ ] Plus d'erreur `42P01 relation "tokens" does not exist` dans les logs.
- [ ] Chemin nominal (Fleet) : `vehicle-options.json` créé dans `/data` (payload complet),
      photo exacte affichée.
- [ ] Chemin repli (API KO) : sans `TESLA_VEHICLE_OPTIONS` → pas d'image (colonne droite
      vide), warn UNIQUE, pas de crash ; avec la variable → image compositor (HTTP 200).
- [ ] Responsive : desktop 2 colonnes / mobile empilé, image qui tient dans le bloc.
- [ ] Régression : aucune écriture dans `tokens`, aucun appel de refresh.

## Commit + tag + push

- [ ] `git commit -m "release: v0.5.2 — photo officielle du véhicule (compositor) dans le bloc STATUS"`
- [ ] `git tag -a v0.5.2 -m "v0.5.2 — photo véhicule compositor"`
- [ ] merge `release/0.5.2` → `main` (ou push de la branche puis PR)
- [ ] `git push origin v0.5.2` ← déclenche `docker-publish`

## Post-push GitHub Actions

- [ ] Vérifier le workflow sur https://github.com/kerkeniw/teslamatefix/actions.
- [ ] `docker pull wkerkeni/teslamatefix:0.5.2` réussit.

## Étapes manuelles (déploiement)

- [ ] Ajouter `TESLAMATE_ENCRYPTION_KEY` (= `ENCRYPTION_KEY` de TeslaMate) à l'env
      du container TeslaMateFix.
- [ ] Vérifier que `/data` est bien un volume persistant inscriptible (cache).
- [ ] Vérifier la page Docker Hub `wkerkeni/teslamatefix` (overview).
