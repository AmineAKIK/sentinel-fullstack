interface SkeletonProps {
  /** Largeur CSS (ex. '100%', 120). Par défaut : pleine largeur. */
  width?: string | number;
  /** Hauteur CSS. Par défaut : une ligne de texte. */
  height?: string | number;
  /** Coins arrondis comme une carte plutôt qu'une ligne. */
  block?: boolean;
  className?: string;
}

/**
 * Placeholder de chargement (doctrine §5.4, P2). Préserve la structure de la
 * page pendant l'attente, sans attirer l'attention sur l'attente elle-même —
 * contrairement à un spinner. Réservé aux chargements de contenu structuré ;
 * le spinner reste pour les actions ponctuelles (boutons).
 */
export default function Skeleton({ width, height, block, className }: SkeletonProps) {
  return (
    <span
      className={`skeleton${block ? ' skeleton--block' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={{
        ...(width !== undefined ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
        ...(height !== undefined
          ? { height: typeof height === 'number' ? `${height}px` : height }
          : {}),
      }}
    />
  );
}
