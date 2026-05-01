# Revue de sécurité — TeslaMateFix

**Date** : 2026-05-01
**Périmètre** : commit `22a1779` (master, working tree clean lors de la revue)
**Verdict global** : *À corriger avant déploiement public* — 0 Critical, 4 High, 6 Medium, 11 Low/hardening.

Le code est globalement bien structuré : Zod partout sur les server actions, Prisma utilisé en mode paramétré, READ_ONLY testé sur toutes les mutations identifiées, gating proxy + `requireSession()` sur toutes les pages métier, init SQL Postgres minimal et propre, Dockerfile `USER node` + `tini`. Quelques points doivent être traités avant exposition publique.

> **État** : les 4 issues High ont été corrigées dans le commit suivant (`security:` …). Voir le diff pour les détails. Les issues Medium et Low restent ouvertes et sont listées ci-dessous comme to-do.

## 🔴 Critical
Aucun.

## 🟠 High (corrigés)

1. **Logout vulnérable au CSRF**
   `src/app/api/auth/logout/route.ts` — POST sans vérification d'`Origin`/`Referer`. Avec `SameSite=lax` (qui autorise le POST top-level cross-site), une page tierce visitée pendant la session pouvait forcer la déconnexion.
   *Fix* : passage en server action (protection origine intégrée Next 16) + suppression de la route handler.

2. **Aucun en-tête de sécurité HTTP**
   `next.config.ts` — pas de CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
   *Fix* : `async headers()` dans `next.config.ts` retournant HSTS (1 an + `includeSubDomains`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. CSP volontairement omise (Next 16 nécessite des nonces dynamiques pour l'hydratation, complexité disproportionnée pour le risque résiduel — à ajouter dans une itération dédiée).

3. **Aucune rotation de session après login (defense-in-depth contre fixation)**
   `src/lib/auth.ts` — `login()` réutilise la session existante sans la détruire. Risque faible (cookie httpOnly + chiffrement authentifié, contenu pré-login vide), mais couche manquante.
   *Fix* : `session.destroy()` avant le `getSession()` qui set les champs et `save()`.

4. **`/api/health/db` accessible non-authentifié**
   `src/proxy.ts` + `src/app/api/health/db/route.ts` — révèle à un attaquant la disponibilité du backend Postgres.
   *Fix* : retiré du whitelist du proxy. La readiness probe Docker peut utiliser `/api/health` (qui passe). Pour les opérateurs voulant une probe DB, route accessible uniquement après authentification.

## 🟡 Medium (à arbitrer)

5. **`x-forwarded-for` non vérifié — rate-limit bypassable si app exposée sans reverse proxy**
   `src/lib/rate-limit.ts:74-80`. `clientIp()` lit naïvement le header. Documentation reverse-proxy à compléter.
   *Fix recommandé* : variable d'env `TRUST_PROXY=true|false`, lecture XFF gated par cette variable. À défaut, section "configurer XFF" dans `docs/INTEGRATION_TESLAMATE.md`.

6. **Aucun rate-limit sur les mutations**
   Seul `/login` est limité. Un session-rider peut spammer `bulkDeletePositions`, `recalcDrive`, etc.
   *Fix recommandé* : wrapper `withRateLimit(actionName, max, window)` par `userId`.

7. **PII potentiellement loggée via `String(e)` dans les `logger.error`**
   Dans toutes les `actions.ts`. Selon l'erreur Prisma, le payload (lat/lon, address) peut atterrir dans `docker logs`.
   *Fix recommandé* : helper `safeErr(e)` retournant `{ code, message }` sans payload.

8. **`scripts/hash-password.mjs` — saisie en clair dans le terminal**
   Pas de masquage du mot de passe.
   *Fix recommandé* : `node:tty` setRawMode + lecture caractère par caractère.

9. **`recalcFromPositions` / `recalcFromTicks` non bornés**
   `src/lib/integrity/drives.ts` charge toutes les positions d'un drive ; `charges.ts` toutes les ticks.
   *Fix recommandé* : `take: 100_000` avec early-fail si dépassé.

10. **`bulkDeletePositions` accepte un tableau non borné**
    `src/app/[locale]/positions/actions.ts`. Aucun cap sur `ids: number[]`.
    *Fix recommandé* : `if (intIds.length > 1000) return error;`.

## 🟢 Low / Hardening (à arbitrer)

11. **Cookie `SameSite=lax` au lieu de `strict`**
    Pour un outil interne, `strict` est plus sûr. Conséquence visible : un lien collé impose un nouveau login.

12. **`secure: NODE_ENV === 'production'` est fragile**
    Si déployé avec `NODE_ENV=production` mais sur HTTP local, le cookie ne s'envoie pas. À documenter ou ajouter `COOKIE_SECURE=auto|true|false`.

13. **Comparaison `username === AUTH_USERNAME` non constant-time**
    `src/lib/auth.ts:54`. En pratique, le bcrypt qui suit noie le timing leak, mais corrigeable trivialement avec `timingSafeEqual`.
    **→ Corrigé** dans le commit de sécurité.

14. **`rel="noreferrer"` au lieu de `rel="noopener noreferrer"`**
    Cosmétique (les navigateurs modernes traitent `noreferrer` comme impliquant `noopener`).

15. **Vulnérabilité `postcss < 8.5.10`**
    Transitive via Next 16.2.4 ; corrigée dans Next 16.3+. Risque applicatif nul.

16. **`bcryptjs` 3.x au lieu de `bcrypt` natif**
    Plus lent mais zéro toolchain native — choix défendable.

17. **`applyRecalc` accepte le payload `after` sans le re-valider**
    Un utilisateur authentifié peut écraser un drive avec des valeurs absurdes (distance: 1e30).
    *Fix recommandé* : Zod sur les bornes plausibles avant écriture, ou recalcul serveur depuis l'ID seul.

18. **`addresses.raw` JSON sans borne de taille**
    Stocker un objet de 10 Mo est possible.
    *Fix recommandé* : `z.string().max(64_000)` sur la string brute.

19. **`from=` accepte les chemins protocol-relative `//evil.com`**
    `src/app/[locale]/login/actions.ts:55-58`. À tester en pratique, mais à durcir par précaution.
    **→ Corrigé** dans le commit de sécurité (regex `/^\/[^/\\]/`).

20. **`next-themes` chargé pour Sonner uniquement**
    Surface d'attaque mineure et coût bundle marginal.

21. **Pas de `Cache-Control: private, no-store` sur les pages authentifiées**
    Les reverse-proxies sont supposés ne pas cacher les responses Set-Cookie, mais à valider en intégration.

## ✅ Bonnes pratiques observées

- Toutes les server actions valident leurs inputs avec Zod.
- Toutes les pages métier appellent `requireSession()`.
- Aucun `dangerouslySetInnerHTML` ni raw SQL en dehors du `SELECT 1` de `/api/health/db`.
- Le `raw` jsonb est rendu via `JSON.stringify` dans un `<textarea>` — pas de risque XSS.
- Validation Zod sur les `searchParams` avec bornes pageSize ∈ {25, 50, 100}.
- `positions` refuse les scans sans filtre étroit (drive_id ou car_id+plage ≤ 31j) — excellent garde-fou DoS.
- Init SQL Postgres : rôle dédié sans accès à `tokens`, `schema_migrations`, schéma `private` ; verbose et idempotent.
- Dockerfile : multi-stage, `USER node`, `tini` PID 1, healthcheck léger.
- `.gitignore` + `.dockerignore` filtrent `.env*` (avec exception `.env.example`), `.git`, `.next`. Le `.env` réel n'a jamais été committé (vérifié via `git log --all -- .env`).
- Comparaison bcrypt avec hash factice quand le username est inconnu (timing-leak atténué).
- Cookie de session : `httpOnly`, `path: "/"`, TTL 7j, password 32+ chars vérifié au boot.
- Transactions Prisma utilisées pour `closePreviousOpenState` et update `cars` + `car_settings`.
- Logger Pino structuré avec champs `event`, `user`, `id`.

## Points d'attention pour la production

- **HTTPS obligatoire** derrière reverse proxy (cookie `Secure` actif sous `NODE_ENV=production`).
- **Trust XFF** : si exposé publiquement, le reverse proxy DOIT écraser `X-Forwarded-For` (cf. Medium #5).
- **Rotation `AUTH_SECRET`** recommandée tous les 6 à 12 mois. Tout changement invalide les sessions actives → re-login.
- **Régénérer `AUTH_PASSWORD_HASH`** : le `.env` local utilise `admin/admin` ; à remplacer en production.
- **Sauvegardes Postgres** indépendantes — `applyRecalc` est définitif sans backup.
- **Logs** : le `docker logs` peut contenir IDs métier et IP. Restreindre l'accès au socket Docker.
- **Mises à jour** : surveiller Next 16.3 (corrige `postcss`), iron-session, Prisma.
- **Pas de mécanisme global de revoke** : si un cookie iron-session est compromis, seule la rotation `AUTH_SECRET` invalide toutes les sessions.
