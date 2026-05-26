  Bonjour,

  Faisant suite à l'incident d'avril/mai sur l'endpoint Hybris /authorizationserver/oauth/token (attaque brute-force pour laquelle nous avions déployé en réaction une blacklist d'IPs en
  urgence — commit 82cb1ca), nous venons de pousser sur master une série de 4 évolutions qui renforcent durablement la sécurité de la plateforme et préparent les prochaines étapes. Aucune
  n'est encore appliquée via terraform apply — les commandes restent à exécuter de manière contrôlée par l'équipe Decade.

  1. Initialisation de la documentation projet (commit 63769de)

  Le dépôt ffd-infra-aws n'avait pas de documentation au-delà d'un court CLAUDE.md. Mise en place d'une suite documentaire complète versionnée dans docs/ :

  - README.md racine (vitrine + quickstart de déploiement)
  - DAT (Dossier d'Architecture Technique) — référence d'architecture avec diagrammes Mermaid
  - EXPLOITATION — guide d'exploitation et gestion du tfstate
  - SECURITY — modèle de sécurité, chaîne d'accès humain, post-mortem incident SAP
  - ONBOARDING — parcours J0 → J+30 pour nouveaux arrivants
  - ENVIRONMENTS — matrice des 7 comptes AWS
  - 8 ADR (Architecture Decision Records) capturant les choix structurants
  - 14 fiches composants + 3 runbooks opérationnels
  - TROUBLESHOOTING, DISASTER-RECOVERY, GLOSSARY

  2. Unification de l'ACL WAF ffd-wafv2 (commit f16b377)

  Auparavant, l'ACL ffd-wafv2 (ouverte, avec managed rules OWASP) ne protégeait que prod et snoop. Sur preprod et recette, l'ACL ffd-wafrestictedv2 était utilisée — elle ne contenait que
  la whitelist d'IPs et aucune managed rule. Conséquence : impossible de valider en preprod le comportement des règles managées avant la prod.

  L'ACL ffd-wafv2 est désormais utilisable sur les 4 environnements via un default_action contextualisé :

  ┌───────────────┬────────────────┬──────────────────────┬──────────────────────────────────────────────┐
  │ Environnement │ default_action │ default_rule_action  │                   Posture                    │
  ├───────────────┼────────────────┼──────────────────────┼──────────────────────────────────────────────┤
  │ prod          │ allow          │ count                │ Ouvert ; managed en log                      │
  ├───────────────┼────────────────┼──────────────────────┼──────────────────────────────────────────────┤
  │ preprod       │ block          │ none (= block actif) │ Whitelist-only ; managed bloquent activement │
  ├───────────────┼────────────────┼──────────────────────┼──────────────────────────────────────────────┤
  │ recette       │ block          │ none                 │ Whitelist-only ; managed bloquent activement │
  ├───────────────┼────────────────┼──────────────────────┼──────────────────────────────────────────────┤
  │ snoop         │ allow          │ count                │ Ouvert (aligné prod)                         │
  └───────────────┴────────────────┴──────────────────────┴──────────────────────────────────────────────┘

  La whitelist est désormais en priorité 100/101 (après les managed rules) pour permettre la validation en preprod. L'ACL ffd-wafrestictedv2 est conservée transitoirement — sa suppression
  interviendra en T2 après bascule du CloudFront preprod/recette vers ffd-wafv2.

  3. Rate-limiting WAF (commit b9f1962)

  Mise en place d'un rule group natif ffd-wafv2-rate-limit-rg référencé dans l'ACL en priorité 200, portant :

  - Rate limit global par IP : 2000 requêtes / 5 min / IP, toutes URLs confondues
  - Rate limit ciblé URL : 100 requêtes / 5 min / IP sur /authorizationserver/oauth/token (≈ 20 req/min, fallback du minimum 100 imposé par notre version du provider AWS)
  - Mode count par défaut (observation) : aucune requête bloquée pour démarrer, les métriques CloudWatch (ffd-wafv2-rate-*-metric) permettent de calibrer avant activation effective
  - Architecture évolutive : ajout de nouvelles URLs via la variable rate_limit_url_rules dans tfvars

  Limitations connues, documentées dans la roadmap :
  - Fenêtre figée à 5 min par notre provider AWS 4.34 (un upgrade en 5.x permettra une fenêtre 1 min)
  - limit minimum 100 (la baisse AWS à 10 en 2024 n'est pas relayée par notre version du provider)

  4. Position paramétrable + activation test preprod/recette (commit 2620d60)

  Pour pouvoir tester l'efficacité du rate-limit sur du trafic interne (tir de charge, audit), une variable rate_limit_priority permet de déplacer la règle avant la whitelist : toutes les
  IPs (y compris partenaires whitelistés) sont alors soumises au rate-limit.

  Mode test activé sur preprod et recette :
  rate_limit_priority = 50    # avant whitelist
  rate_limit_action   = "block"

  → Permet d'observer en conditions réelles les blocages effectifs sur des environnements sans impact métier prod, avant d'envisager une bascule prod en block.

  Prochaines étapes (séquentielles)

  1. Apply en recette puis preprod (côté Decade DevOps) pour matérialiser le rate-limit en mode block et le déploiement de l'ACL unifiée. Observation des métriques sur quelques semaines.
  2. Décision bascule prod count → block sur la base des observations CloudWatch.
  3. T2 — Bascule CloudFront preprod/recette vers ffd-wafv2 puis suppression de l'ACL ffd-wafrestictedv2 (gain : -1 ACL maintenue, -5 $/mois, surface attaque homogène).
  4. Roadmap sécurité moyen terme (cf. docs/SECURITY.md §13) :
    - AWSManagedRulesATPRuleSet (Account Takeover Prevention) — managed rule AWS spécifique aux endpoints d'auth, particulièrement pertinent vu l'incident
    - Logging WAFv2 → S3 via Kinesis Firehose pour l'investigation post-incident
    - Alarmes CloudWatch sur les compteurs BlockedRequests
    - Custom response 429 + Retry-After (sémantique HTTP correcte sur rate-limit)
    - Upgrade provider AWS 5.x pour fenêtre 1 min stricte
    - Activation des logs CloudFront (actuellement désactivés)

  Documentation et runbooks

  Tout est versionné dans le dépôt Bitbucket decadesa/ffd-infra-aws :

  - Architecture détaillée : docs/DAT.md (notamment §5.5 WAF)
  - Modèle de sécurité : docs/SECURITY.md (§6 WAF, §7 post-mortem incident, §13 roadmap)
  - Procédure ajout/modification rate-limit : docs/runbooks/mise-a-jour-rate-limit-waf.md
  - Procédure modification IPSet whitelist/blacklist : docs/runbooks/mise-a-jour-waf-ipset.md
  - Décisions d'architecture : docs/adr/0005-waf-managed-rules-and-geo-block.md

  Points d'attention pour la prod

  - Aucun changement effectif en production tant que les apply n'ont pas été lancés.
  - L'apply prod sur le rate-limit est en mode count (observation seulement) — pas de risque de blocage.
  - L'apply prod sur l'unification ACL ne modifie pas l'association CloudFront — pas d'impact utilisateur final.
  - Pendant la phase de test sur preprod/recette en mode block, prévenir les partenaires (Sensefuel, Partoo, Beyable, équipes pentest) si ils utilisent ces environnements et risquent de
  dépasser les seuils.

  Restant à votre disposition pour toute clarification ou démo, et pour planifier les apply progressifs.