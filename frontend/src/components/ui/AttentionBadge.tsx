import { AttentionLevel } from '../../utils/attention';

interface AttentionBadgeProps {
  level: AttentionLevel;
  children: React.ReactNode;
}

/**
 * Badge dont le traitement visuel encode un niveau d'attention (doctrine §5.1).
 * La couleur dit, elle ne décore pas : un même niveau produit toujours le même
 * rendu dans toute l'application.
 */
export default function AttentionBadge({ level, children }: AttentionBadgeProps) {
  return <span className={`attention-badge attention-badge--${level}`}>{children}</span>;
}
