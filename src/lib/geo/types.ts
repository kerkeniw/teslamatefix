/**
 * Types géo partagés client/serveur. Ce module ne dépend PAS de `env` ni de
 * Prisma : il peut être importé depuis un composant client. La logique de
 * géocodage (qui lit `env`) vit dans `geocode.ts` (serveur uniquement).
 */
import type { AddressFormValues } from "@/components/entities/addresses/AddressForm";

/**
 * Suggestion prête à l'emploi côté client : libellé d'affichage, coordonnées
 * pour le calcul d'itinéraire / la géofence, et `values` déjà mappées vers
 * l'entité `addresses` (pour création à la sélection).
 */
export type GeoSuggestion = {
  /** Clé stable `osm_type:osm_id` (identifiant d'item du combobox). */
  key: string;
  label: string;
  lat: number;
  lon: number;
  values: AddressFormValues;
};
