interface CharCounterProps {
  current: number;
  max: number;
}

/**
 * Compteur de caractères affiché sous un champ texte libre.
 * Passe en alerte à partir de 90 % de la limite.
 */
export default function CharCounter({ current, max }: CharCounterProps) {
  const warning = current >= max * 0.9;
  return (
    <div className={`char-counter${warning ? ' char-counter--warning' : ''}`}>
      {current} / {max}
    </div>
  );
}
