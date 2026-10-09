# Release v0.7.1 — checklist (hygiène)

> Document de suivi pour **TeslaMateFix v0.7.1** (nettoyage après la v0.7.0).
> Lot listé dans [`ROADMAP.md`](ROADMAP.md#v071--hygiène-p1p2).

## État

- Branche : `main` (lot de stabilisation, pas de worktree).
- `package.json` version : inchangée (`0.7.0`).
- Nature : **hygiène du dépôt + lint**, aucun changement fonctionnel. Pas de
  publication Docker nécessaire : ces commits partiront avec la prochaine release
  taggée (v0.8.0).

## Fait

### Dépôt

- Worktrees absorbés supprimés : `feat+drive-edit-map`, `feat+positions-map`,
  `feat+drive-create-wizard`, `release+v0.7.0`.
- Branches locales fusionnées supprimées (`feat/cockpit-design`,
  `feat/public-zero-config`, `feat/drive-edit-map`, `feat/positions-map`,
  `worktree-feat+drive-create-wizard`).
- Branches distantes fusionnées supprimées : `feat/drive-edit-map`,
  `release/v0.7.0`, `feat/cockpit-design`, `feat/public-zero-config`.
- Tags : **v0.1.0** supprimé (local + GitHub) ; **v0.5.1** n'a jamais été posé et
  ne le sera pas (release doc only).
- Scripts NAS (`scripts/teslamate-pull-from-nas.sh` + DROP du schéma `telemetry`
  dans `scripts/teslamate-restore.sh`) sortis de `main` et conservés sur la branche
  `chore/nas-pull-scripts` : ils supposent l'installation TeslaMateAPI, à adapter
  à une installation sans TeslaMateAPI avant merge.

### Lint (`npx eslint src` : 0 erreur, 0 avertissement)

- **`ChargeCreateWizard.tsx`** — le `useEffect` qui recopiait le courant
  chargeur dans le courant pilote (`react-hooks/set-state-in-effect`) est remplacé
  par une valeur dérivée au rendu (`pilotCurrentValue`). Comportement identique :
  tant que le champ pilote n'est pas modifié à la main, il affiche le courant
  chargeur.
- **`data-table.tsx`** — `react-hooks/incompatible-library` désactivé sur
  `useReactTable` (TanStack Table n'est pas mémoïsable par le React Compiler).
- **`charges/actions.ts`** — `_ignored` (déstructuration pour retirer `id`) marqué
  comme volontairement inutilisé.

Tests : `npm test` 129/129, `tsc --noEmit` OK.

## Étapes manuelles restantes

- [ ] Retirer `docs/issues/` (mail infra AWS commité par erreur) :
      `git rm -r docs/issues && git commit -m "chore: retire docs/issues (commité par erreur)"`
- [ ] Supprimer la branche locale `release/v0.7.0` (déjà fusionnée, sa branche
      distante n'existe plus) : `git branch -D release/v0.7.0`
- [ ] `git push origin main`
- [ ] (P3) Purger les captures Playwright à la racine (`*.png`, ignorées par git).
