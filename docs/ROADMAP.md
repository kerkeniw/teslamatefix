# Roadmap — TeslaMateFix

> Mise à jour : **2026-09-23** (reprise du projet, consolidation v0.7.0).
> Document vivant : cocher / déplacer les lignes au fil des releases. Le détail de
> chaque version livrée est dans son `RELEASE_v<version>.md`, la recette dans
> [`TEST_PLAN.md`](TEST_PLAN.md).

Légende priorité : **P1** = à faire avant tout nouveau développement, **P2** = prochain
lot, **P3** = quand l'occasion se présente.
Légende statut : ✅ fait · 🟡 en cours / partiel · ⬜ à faire.

---

## Versions livrées

| Version | Date | Contenu | Doc |
|---|---|---|---|
| v0.1.0 | 2026-05-24 | UI de correction initiale : 9 entités, règles d'intégrité, dashboard, Docker | [IMPLEMENTATION](IMPLEMENTATION.md) |
| v0.2.0 | 2026-05-24 | Démarrage zero-config « grand public » (bootstrap auth) | [RELEASE](RELEASE_v0.2.0.md) |
| v0.3.0 | 2026-05-25 | Fuseau horaire (UTC strict en base), 22 colonnes de ticks, règle « appliquer à tous les ticks » | [RELEASE](RELEASE_v0.3.0.md) |
| v0.4.0 | 2026-05-26 | Refonte UI charges (carte, delta SOC, charger split), menu burger mobile | [RELEASE](RELEASE_v0.4.0.md) |
| v0.5.0 | 2026-06-14 | Fleet API : TeslaMateFix sert la clé publique Tesla + guide de migration | [RELEASE](RELEASE_v0.5.0.md) |
| v0.5.1 | 2026-06-23 | Outillage Fleet API (collection Postman, scope `vehicle_location`) — *doc only, jamais taggée* | [RELEASE](RELEASE_v0.5.1.md) |
| v0.5.2 | 2026-07-02 | Photo officielle du véhicule (compositor), onglet Options, `/cars` en lecture seule | [RELEASE](RELEASE_v0.5.2.md) |
| **v0.7.0** | 2026-09-23 | Trajets (assistant de création, édition + carte, listing Grafana, correction d'anomalies) + Positions (carte, lots, quick-ranges) + stabilisation des charges (chevauchement, coût auto, autonomies depuis SOC). *Mergée et taggée en local, push à faire* | [RELEASE](RELEASE_v0.7.0.md) |

> La v0.6.0 n'a jamais été publiée : son contenu est intégré à la v0.7.0.

---

## v0.7.0 — publication (P1)

| Tâche | Prio | Statut |
|---|---|---|
| Tests, typecheck, build verts sur `release/v0.7.0` | P1 | ✅ |
| Documentation consolidée (README, RELEASE, IMPLEMENTATION, SECURITY addendum) | P1 | ✅ |
| Merge fast-forward sur `main` + tag `v0.7.0` (en local) | P1 | ✅ |
| Commit des corrections charges + tag `v0.7.0` déplacé (local) | P1 | ✅ |
| `git push origin main` puis `git push origin v0.7.0` (publication Docker Hub) | P1 | ⬜ |
| Vérifier GitHub Actions + `docker manifest inspect wkerkeni/teslamatefix:0.7.0` (amd64 + arm64) | P1 | ⬜ |
| Recette manuelle v0.7.0 ([TEST_PLAN §3](TEST_PLAN.md)) sur une base sauvegardée | P1 | ⬜ |
| Vérifier l'overview Docker Hub (mention v0.7.0) | P2 | ⬜ |
| Listing charges : date cliquable, suppression de la colonne stylo | P1 | ✅ |
| Faux chevauchement causé par les sessions ouvertes (248, 251) : fin effective = dernier tick | P1 | ✅ |
| Coût calculé depuis le tarif de la géofence | P1 | ✅ |
| Autonomies déduites du SOC de départ / d'arrivée | P1 | ✅ |
| Fermer les sessions 248 et 251 via l'onglet Recalcul (données) | P1 | ⬜ |
| Même calcul coût / autonomies dans l'assistant de création de charge | P2 | ⬜ |

## v0.7.1 — hygiène (P1/P2)

| Tâche | Prio | Statut |
|---|---|---|
| Supprimer les worktrees absorbés (`feat+drive-edit-map`, `feat+positions-map`, `feat+drive-create-wizard`, `release+v0.7.0`) et leurs branches locales | P1 | ⬜ |
| Supprimer les branches distantes fusionnées (`feat/drive-edit-map`, `release/v0.7.0`, `feat/cockpit-design`, `feat/public-zero-config`) | P2 | ⬜ |
| Tags : décider pour **v0.5.1** (jamais posé) et pousser **v0.1.0** (local uniquement) | P2 | ⬜ |
| Retirer `docs/issues/` (mail infra AWS sans rapport avec le projet, commité par erreur) | P1 | ⬜ |
| Lint : `react-hooks/set-state-in-effect` dans `ChargeCreateWizard.tsx:585` (dériver l'état au lieu d'un `useEffect`) | P2 | ⬜ |
| Lint : avertissement TanStack `useReactTable` dans `data-table.tsx`, `_ignored` inutilisé dans `charges/actions.ts` | P3 | ⬜ |
| Cocher a posteriori (ou archiver) les checklists des `RELEASE_v0.2.0…v0.5.2.md` publiées | P3 | ⬜ |
| Purger les captures Playwright locales à la racine (ignorées par git) | P3 | ⬜ |

## v0.8.0 — durcissement sécurité (P2)

Source : [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) (revue du 2026-05-01 + addendum v0.7.0).

| # | Tâche | Prio | Statut |
|---|---|---|---|
| v0.7 | Correction de trajet : recalcul/revalidation **côté serveur** du payload `after`, bornes sur `absorbedPositionIds`, décision sur le contournement de `READ_ONLY` | P1 | ⬜ |
| M5 | `TRUST_PROXY=true\|false` : ne lire `X-Forwarded-For` que derrière un reverse proxy de confiance | P2 | ⬜ |
| M6 | Limite de débit sur les mutations (`withRateLimit(action, max, window)` par utilisateur) | P2 | ⬜ |
| M7 | `safeErr(e)` : ne plus logger de payload (coordonnées, adresses) dans `logger.error` | P2 | ⬜ |
| M8 | `scripts/hash-password.mjs` : saisie masquée du mot de passe | P3 | ⬜ |
| M9 | `recalcFromPositions` / `recalcFromTicks` : `take` borné + échec explicite | P2 | ⬜ |
| M10 | `bulkDeletePositions` : plafond sur la taille de `ids` | P2 | ⬜ |
| L17 | `applyRecalc` : revalider `after` (même correctif que la ligne v0.7) | P2 | ⬜ |
| L18 | `addresses.raw` : taille maximale | P3 | ⬜ |
| L21 | `Cache-Control: private, no-store` sur les pages authentifiées | P3 | ⬜ |
| L11/12 | Cookie : `SameSite=strict` optionnel, `COOKIE_SECURE=auto\|true\|false` | P3 | ⬜ |
| — | Mettre à jour Next (≥ 16.3 corrige `postcss`), Prisma, iron-session | P2 | ⬜ |

## v0.8.x — tests automatisés (P2)

Priorités détaillées dans [`TEST_PLAN.md` §5](TEST_PLAN.md).

| Tâche | Prio | Statut |
|---|---|---|
| Tests unitaires des helpers purs non couverts : `quick-ranges.ts`, `map-points.ts`, `units.ts`, `format/duration.ts` | P2 | ⬜ |
| Tests de la couche géo avec `fetch` mocké (`src/lib/geo/*`) | P2 | ⬜ |
| Tests des server actions critiques (garde `READ_ONLY`, validation Zod, transactions) avec Prisma mocké | P2 | ⬜ |
| E2E Playwright en lecture : listing trajets + filtres, carte positions, édition charge | P2 | ⬜ |
| E2E en écriture sur une **base de test jetable** (création trajet, correction, charge) | P3 | ⬜ |
| Lancer `test` + `typecheck` + `lint` dans la CI GitHub Actions avant la publication Docker (aujourd'hui `docker-publish.yml` ne fait que construire et pousser l'image) | P2 | ⬜ |

## Évolutions fonctionnelles (P3, à prioriser)

| Tâche | Prio | Statut |
|---|---|---|
| Assistant trajet : calcul du dénivelé (`ascent`/`descent`) via une API d'élévation | P3 | ⬜ |
| Doc : héberger soi-même Nominatim / OSRM (quotas des instances publiques) | P3 | ⬜ |
| Valider et fiabiliser les flux d'édition des autres entités (adresses, géofences, états, mises à jour, paramètres) — aujourd'hui « non tous validés » | P3 | 🟡 |
| Détection d'anomalies étendue aux charges (même principe que les trajets) | P3 | ⬜ |
| Dashboard : aligner sa liste d'anomalies sur les règles de détection de l'édition de trajet, avec accès direct à « Corriger » | P3 | ⬜ |
