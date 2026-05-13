"use client";

import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

type LinkProps = ComponentProps<typeof Link>;

type ButtonLinkProps = Omit<
  ComponentProps<typeof Button>,
  "render" | "nativeButton" | "type"
> & {
  href: LinkProps["href"];
  locale?: LinkProps["locale"];
  prefetch?: LinkProps["prefetch"];
  target?: string;
  rel?: string;
  children?: ReactNode;
};

/**
 * Bouton qui navigue via le router locale-aware de next-intl.
 *
 * Encapsule la combinaison correcte pour shadcn preset `base-nova` :
 * `Button + render={<Link/>} + nativeButton={false}`. Sans `nativeButton={false}`,
 * `@base-ui/react/button` warn que l'élément rendu n'est pas un <button> natif
 * (ce qui casse les sémantiques de form/a11y).
 *
 * À utiliser à la place de :
 *   - `<Link><Button/></Link>` (HTML invalide : <a> imbriqué dans <a>)
 *   - `<Button render={<Link/>}>` brut (déclenche le warning a11y)
 */
export function ButtonLink({
  href,
  locale,
  prefetch,
  target,
  rel,
  children,
  ...buttonProps
}: ButtonLinkProps) {
  return (
    <Button
      {...buttonProps}
      nativeButton={false}
      render={
        <Link
          href={href}
          locale={locale}
          prefetch={prefetch}
          target={target}
          rel={rel}
        />
      }
    >
      {children}
    </Button>
  );
}
