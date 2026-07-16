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

  // Position the menu using fixed coords relative to the trigger
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 1200,
    });
  }, [open]);

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
