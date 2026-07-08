# TeslaMateFix

Outil web mobile-first pour **corriger et compléter** les données collectées par
[TeslaMate](https://github.com/teslamate-org/teslamate). Quand la voiture perd sa
connexion (parking souterrain, zone blanche, panne API), des trajets et sessions
de charge sont enregistrés incomplets — fin manquante, kilométrage faux, énergie
absente, état bloqué sur `online`. TeslaMateFix s'ajoute au `docker-compose` de
TeslaMate, se connecte à sa base PostgreSQL et expose une UI sécurisée pour
réparer chaque entité (`drives`, `charges`, `positions`, `addresses`,
`geofences`, `states`, `updates`, `cars`, `settings`).

> **Statut v0.7.0** — les modules de **création et de modification des charges et
> des trajets** (dont l'**assistant de création de trajet** avec géocodage +
> itinéraire, et l'**édition de trajet avec carte**) sont les flux d'écriture
> couverts. La page **Positions** est un outil d'exploration cartographique en
> lecture. Les autres entités (adresses, géofences, états, mises à jour de
> firmware, voitures, paramètres) restent accessibles en **consultation** ; leurs
> flux d'édition n'ont pas tous été validés. À utiliser avec précaution et
> **toujours sur une base sauvegardée** (`pg_dump` recommandé avant la première
> utilisation).

## Nouveautés v0.7.0

Cette release regroupe **trois évolutions** livrées ensemble : l'assistant de
création de trajet, l'édition de trajet avec carte, et la refonte cartographique
de la page Positions.

### Assistant de création de trajet (`/drives/new`)

L'écran devient un assistant guidé : on saisit l'adresse de départ et d'arrivée
(**autocomplétion géocodée** avec numéros de rue), la date/heure de départ, puis on
clique **Calculer**.

- **Adresses obligatoires** via un combobox géocodé (Nominatim). Si la recherche
  ne renvoie rien, un lien ouvre une **boîte de dialogue de création d'adresse**
  pré-remplie ; à la sélection d'une proposition, tous les champs sont remplis et
  l'adresse est créée (dédup `osm_id/osm_type`).
- **Géofence auto-sélectionnée** si l'adresse tombe dans une zone existante.
- **Calculer** récupère l'état de départ (dernière position avant la date, sinon
  saisie manuelle : odomètre, batterie, autonomie, température), calcule
  l'**itinéraire** (OSRM) et **génère les positions** (~1 / 30 s) + les infos
  d'arrivée.
- La **sauvegarde** n'est active qu'après calcul et persiste le trajet **et toutes
  ses positions** en une transaction.

Configuration (géocodeur/routeur, modèle de consommation) : voir la section
*Assistant de création de trajet* de [`.env.example`](.env.example).

### Édition d'un trajet : layout large + carte

L'écran d'édition d'un trajet adopte la mise en page large de l'édition de charge
et gagne une **carte du trajet parcouru** :

- **Layout deux colonnes** (1/3 – 2/3) : à gauche les sections *Temps*,
  *Énergie / Autonomie*, *Performances* et *Météo* ; à droite la localisation
  (adresses + géofences départ/arrivée), l'odomètre (départ / arrivée / distance)
  et la carte.
- **Énergie consommée estimée** affichée en direct, dérivée du delta d'autonomie
  *rated* (à défaut *ideal*) × `cars.efficiency` (kWh/km).
- **Carte Leaflet du trajet** : marqueurs départ (vert) et arrivée (rouge), tracé
  de toutes les positions GPS, cadrage automatique.
- **Colorisation du tracé** via boutons radio : *Trajet* (bleu), *Puissance*
  (dégradé vert foncé → rouge foncé selon `power_min`/`power_max`) et *Vitesse*
  (dégradé vert → jaune → rouge).

Détails et checklist de cette partie : [`docs/RELEASE_v0.6.0.md`](docs/RELEASE_v0.6.0.md).

### Positions : carte géographique + filtres

La page **Positions** devient un véritable outil d'exploration géographique, dans
l'esprit du tableau de bord Grafana de TeslaMate :

- **Layout carte + filtres** : bloc filtres à gauche (1/4), **carte interactive**
  Leaflet à droite (3/4), puis **tableau pleine largeur** en dessous affichant
  **tous les champs** de la table (scroll horizontal).
- **Ouverture par défaut sur les 7 derniers jours**, avec un **menu déroulant de
  plages rapides façon Grafana** (relatives jusqu'à 5 ans, journée, période en cours
  « … jusqu'à présent », périodes précédentes ; plages fiscales omises).
- **Carte multi-trajets** : une polyline colorée par trajet (`drive_id`) avec
  marqueurs départ/arrivée, plus des points pour les positions hors trajet ; popup
  par point avec lien vers l'édition. Cadrage automatique sur l'ensemble.
- **Chargement AJAX incrémental** : les points sont chargés par lots et affichés
  au fur et à mesure (la page ne bloque plus sur une grosse requête). La **carte
  n'a plus de plafond de plage** (sécurité = plafond de points + bouton « charger
  plus ») ; le **tableau garde son garde-fou 31 jours**.
- **Filtre de trajets** : liste de cases à cocher (une par trajet + « hors trajet »,
  « tout / aucun »), alignée sur la hauteur de la carte (scroll interne), pour afficher
  instantanément un ou plusieurs trajets. La liste se remplit **au fil du chargement des
  positions**, dans l'**ordre chronologique**.

Détails techniques et checklist de release :
[`docs/RELEASE_v0.7.0.md`](docs/RELEASE_v0.7.0.md).

## Nouveautés v0.5.2

**Photo officielle du véhicule sur l'accueil.** Le bloc STATUS est désormais
divisé en deux : infos à gauche, **photo officielle Tesla** à droite (rendu
*compositor*, comme sur le site Tesla).

- Les **codes option** du véhicule sont récupérés via la Fleet API
  `GET /api/1/dx/vehicles/options?vin=` ; **l'ensemble de la réponse est mis en
  cache** (fichier JSON dans `/data`) et sert à générer l'URL du média.
- Le token utilisé est celui de **TeslaMate** : TeslaMateFix lit (en **lecture
  seule**) la table `tokens` et la déchiffre avec la clé Cloak partagée
  (`TESLAMATE_ENCRYPTION_KEY`). Aucun refresh n'est déclenché côté TeslaMateFix.
- **Repli** : si l'API est inaccessible (pas de token / clé KO / hors-ligne), on
  utilise la variable `TESLA_VEHICLE_OPTIONS`. Aucun code n'est codé en dur : sans
  API ni variable, aucune image n'est affichée.
- **Slider multi-vues** (3/4 avant, profil, 3/4 arrière, jantes, sièges, intérieur) : défilement
  automatique, pause au survol, flèches `<`/`>`. Une vue non supportée par la config est ignorée.

Configuration : voir la section *Fleet API* de [`.env.example`](.env.example).
Détails et checklist : [`docs/RELEASE_v0.5.2.md`](docs/RELEASE_v0.5.2.md).

## Nouveautés v0.5.1

Outillage et correctifs autour de la Fleet API (release **doc only**, aucun
changement de code applicatif) :

- **Collection Postman complète de la Fleet API** (116 requêtes : auth OAuth,
  vehicle data & commandes, charging, energy, partner, user) pour explorer/tester
  ce que l'API expose — Tesla ne publiant ni OpenAPI ni collection officielle.
  Environnement EU pré-rempli inclus : [`postman/`](postman/).
- **Fix `403 missing scopes vehicle_location`** : le scope `vehicle_location` est
  désormais documenté (scopes de l'app + URL d'autorisation), avec un dépannage du
  **403 qui persiste après ré-auth**. Piège clé : le scope doit être accordé dans
  **`account.tesla.com`** (applications tierces), pas seulement déclaré sur
  `developer.tesla.com`. Voir [`docs/FLEET_API_MIGRATION.md`](docs/FLEET_API_MIGRATION.md).

Détails et checklist : [`docs/RELEASE_v0.5.1.md`](docs/RELEASE_v0.5.1.md).

## Nouveautés v0.5.0

Tesla a coupé l'**Owner API** pour les particuliers (juin 2026, erreurs `403`) :
TeslaMate ne collecte plus de données sans migration vers la **Fleet API**.
Celle-ci impose d'héberger une clé publique sur un domaine pour valider
l'application — TeslaMateFix sait désormais le faire :

- **Clé publique Tesla servie par TeslaMateFix** sur
  `/.well-known/appspecific/com.tesla.3p.public-key.pem` — **aucun service web
  supplémentaire** : un *rewrite* interne route l'URL vers une route handler
  publique, le fichier `.pem` est monté en lecture seule (`/well-known:ro`) et
  lu à chaud (rotation possible sans rebuild). Variable `TESLA_PUBLIC_KEY_FILE`.
- **Guide de migration Owner API → Fleet API** pas-à-pas (app developer Tesla,
  clés EC, enregistrement de domaine, tokens utilisateur `access`+`refresh`,
  reconfiguration TeslaMate) :
  [`docs/FLEET_API_MIGRATION.md`](docs/FLEET_API_MIGRATION.md).

Détails techniques et checklist de release :
[`docs/RELEASE_v0.5.0.md`](docs/RELEASE_v0.5.0.md).

## Nouveautés v0.4.0

Refonte UI majeure de l'écran d'édition d'une charge et adaptation mobile :

- **Carte géographique** centrée sur la position de la charge, avec marqueur
  Leaflet + tuiles OpenStreetMap. Affichée uniquement sur l'onglet Session.
- **Delta SOC dans le titre** (`32 % → 80 %`) avec picto pile rempli vert
  proportionnel à la capacité atteinte ; bouton pour basculer entre % et km
  d'autonomie idéale.
- **Bloc Borne scindé** : type + puissance + *Appliquer* / *Annuler* en haut,
  détails (V, A, phases, marque, câble, …) repliables — bloc Batterie remonté
  juste sous le bloc principal.
- **Header mobile compacté** : logo + sélecteur véhicule visibles ; navigation
  principale + fuseau horaire + thème + langue + déconnexion regroupés dans
  un menu burger `☰` (panneau latéral).
- **`outside_temp_avg`** propagé sur les ticks selon la règle métier
  *Appliquer à tous les ticks* (même verrouillage qu'AC/DC).

Détails complets, schéma serveur et dépendances :
[`docs/RELEASE_v0.4.0.md`](docs/RELEASE_v0.4.0.md).

## Installation

Ajouter ce bloc à votre `docker-compose.yml` TeslaMate, à côté des services
`teslamate` / `database` / `grafana` / `mosquitto` :

```yaml
services:
  teslamatefix:
    image: wkerkeni/teslamatefix:latest
    restart: always
    depends_on:
      - database
    ports:
      - "3001:3001"
    environment:
      DATABASE_USER: "${DATABASE_USER:-teslamate}"
      DATABASE_PASS: "${DATABASE_PASS}"
      DATABASE_NAME: "${DATABASE_NAME:-teslamate}"
    volumes:
      - teslamatefix-data:/data

volumes:
  teslamatefix-data:
```

Puis :

```bash
docker compose up -d teslamatefix
```

Ouvrir `http://<host>:3001`, se connecter avec **`admin`** / **`admin`** et
choisir un nouveau mot de passe lors de la redirection (premier login obligatoire,
pattern Grafana).

C'est tout. Le secret de session et le hash bcrypt sont générés
automatiquement au premier démarrage et persistés dans le volume
`teslamatefix-data`.

## Mise à jour

```bash
docker compose pull teslamatefix
docker compose up -d teslamatefix
```

Compose recrée le conteneur avec la nouvelle image. Le volume
`teslamatefix-data` est préservé, donc mot de passe et clé de session
survivent. Détails et compatibilité TeslaMate :
[`docs/INSTALL.md`](docs/INSTALL.md#3-mise-à-jour).

## Aller plus loin

- **Sécuriser la mise en prod** (HTTPS reverse-proxy, rôle PostgreSQL dédié,
  hash fourni en env, mode lecture seule) — voir
  [`docs/INSTALL.md`](docs/INSTALL.md) (FR) /
  [`docs/INSTALL.en.md`](docs/INSTALL.en.md) (EN).
- **Intégration TeslaMate détaillée** (sauvegarde Postgres, reverse-proxy
  nginx/Caddy/Traefik) —
  [`docs/INTEGRATION_TESLAMATE.md`](docs/INTEGRATION_TESLAMATE.md).
- **Stack technique** — Next.js 16, React 19, Prisma 6 (introspection
  read-only de TeslaMate), iron-session, next-intl FR/EN, Tailwind 4 +
  shadcn/ui.

## Licence

MIT.
