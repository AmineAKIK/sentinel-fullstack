import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectFieldProps = {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
};

export default function SelectField({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Sélectionner',
  ariaLabel,
}: SelectFieldProps) {
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Position the menu using fixed coords relative to the trigger. When there
  // isn't enough room below (trigger low in the viewport), open UPWARD. In both
  // directions, `maxHeight` is clamped to the space ACTUALLY available on the
  // chosen side (never floored above it), so the menu — and every option —
  // stays fully inside the viewport and clickable, even when both sides are
  // short (small viewport, high zoom, mobile landscape).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    // Marge explicite conservée au bord du viewport (jamais collé au bord).
    const gap = 4;
    const viewportMargin = 8;

    function computeMenuStyle(): React.CSSProperties {
      const rect = triggerRef.current!.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const spaceBelow = Math.max(0, viewportH - rect.bottom - gap - viewportMargin);
      const spaceAbove = Math.max(0, rect.top - gap - viewportMargin);
      // Hauteur souhaitée (contenu réel, sans borne artificielle).
      const desired = options.length * 40 + 8;
      const openUp = spaceBelow < desired && spaceAbove > spaceBelow;
      // Borne STRICTE à l'espace réellement disponible du côté choisi : jamais
      // un plancher qui autoriserait un débordement (ex. Math.max(120, …)).
      const available = openUp ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(0, Math.min(desired, available));

      return openUp
        ? {
            position: 'fixed',
            bottom: viewportH - rect.top + gap,
            left: rect.left,
            width: rect.width,
            maxHeight,
            overflowY: 'auto',
            zIndex: 1200,
          }
        : {
            position: 'fixed',
            top: rect.bottom + gap,
            left: rect.left,
            width: rect.width,
            maxHeight,
            overflowY: 'auto',
            zIndex: 1200,
          };
    }

    setMenuStyle(computeMenuStyle());

    // Un scroll de page (y compris dans un conteneur défilant ancêtre, d'où la
    // phase de capture) ou un redimensionnement change la position du
    // déclencheur : on RECALCULE la position plutôt que de garder des
    // coordonnées obsolètes, pour ne jamais déborder à nouveau du viewport ni
    // fermer le menu de façon inattendue pendant l'interaction.
    function handleViewportChange() {
      setMenuStyle(computeMenuStyle());
    }
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return undefined;

    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options));

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, options, selectedIndex]);

  function choose(option: SelectOption, index?: number) {
    if (option.disabled) return;
    if (typeof index === 'number') setActiveIndex(index);
    onChange(option.value);
    setOpen(false);
  }

  function moveActiveOption(direction: 1 | -1) {
    const enabled = options
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.disabled);
    if (enabled.length === 0) return;

    const current = enabled.findIndex(({ index }) => index === activeIndex);
    const next =
      current === -1
        ? enabled[direction === 1 ? 0 : enabled.length - 1]
        : enabled[(current + direction + enabled.length) % enabled.length];
    setActiveIndex(next.index);
  }

  function commitActiveOption() {
    const option = options[activeIndex];
    if (option) choose(option, activeIndex);
  }

  return (
    <div className="select-field" ref={rootRef}>
      <button
        id={id}
        ref={triggerRef}
        className="select-trigger"
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open) setOpen(true);
            else moveActiveOption(1);
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) setOpen(true);
            else moveActiveOption(-1);
          }
          if (event.key === 'Escape') {
            setOpen(false);
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (open) commitActiveOption();
            else setOpen(true);
          }
        }}
      >
        <span>{selected?.label || placeholder}</span>
        <span className="select-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="select-menu" id={listboxId} role="listbox" style={menuStyle}>
          {options.map((option, index) => (
            <button
              key={option.value}
              id={`${listboxId}-option-${index}`}
              className={[
                'select-option',
                index === activeIndex ? 'active' : '',
                option.value === value ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option, index)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function firstEnabledIndex(options: SelectOption[]) {
  return options.findIndex((option) => !option.disabled);
}
