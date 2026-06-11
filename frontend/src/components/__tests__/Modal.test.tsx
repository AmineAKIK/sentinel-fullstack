import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../../components/Modal';

function noop() {}

// ─── basic rendering ──────────────────────────────────────────────────────────

describe('Modal – rendering', () => {
  it('renders the title', () => {
    render(<Modal title="Mon titre" footer={null}><p>Contenu</p></Modal>);
    expect(screen.getByText('Mon titre')).toBeDefined();
  });

  it('renders children inside the modal body', () => {
    render(<Modal title="T" footer={null}><p>Corps du modal</p></Modal>);
    expect(screen.getByText('Corps du modal')).toBeDefined();
  });

  it('renders the footer content', () => {
    render(<Modal title="T" footer={<button>OK</button>}><span /></Modal>);
    expect(screen.getByRole('button', { name: 'OK' })).toBeDefined();
  });

  it('sets role="dialog" on the modal container', () => {
    render(<Modal title="T" footer={null}><span /></Modal>);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('sets aria-label to the title on the dialog', () => {
    render(<Modal title="Détails incident" footer={null}><span /></Modal>);
    expect(screen.getByRole('dialog', { name: 'Détails incident' })).toBeDefined();
  });
});

// ─── close button ─────────────────────────────────────────────────────────────

describe('Modal – close button', () => {
  it('shows the close button when onClose is provided', () => {
    render(<Modal title="T" footer={null} onClose={noop}><span /></Modal>);
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDefined();
  });

  it('does NOT show the close button when onClose is omitted', () => {
    render(<Modal title="T" footer={null}><span /></Modal>);
    expect(screen.queryByRole('button', { name: 'Fermer' })).toBeNull();
  });

  it('calls onClose when the close button is clicked and isDirty=false', () => {
    const onClose = vi.fn();
    render(<Modal title="T" footer={null} onClose={onClose}><span /></Modal>);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when isLoading=true', () => {
    const onClose = vi.fn();
    render(<Modal title="T" footer={null} onClose={onClose} isLoading><span /></Modal>);
    // Close button should not be rendered while loading
    expect(screen.queryByRole('button', { name: 'Fermer' })).toBeNull();
  });
});

// ─── isDirty confirmation ──────────────────────────────────────────────────────

describe('Modal – dirty confirmation overlay', () => {
  it('shows a confirmation overlay instead of calling onClose when isDirty=true', () => {
    const onClose = vi.fn();
    render(<Modal title="T" footer={null} onClose={onClose} isDirty><span /></Modal>);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Quitter sans enregistrer ?')).toBeDefined();
  });

  it('dismisses the confirmation when "Continuer l\'édition" is clicked', () => {
    const onClose = vi.fn();
    render(<Modal title="T" footer={null} onClose={onClose} isDirty><span /></Modal>);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/i }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Quitter sans enregistrer ?')).toBeNull();
  });

  it('calls onClose when "Quitter" is clicked in the confirmation', () => {
    const onClose = vi.fn();
    render(<Modal title="T" footer={null} onClose={onClose} isDirty><span /></Modal>);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitter' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ─── overlay click ────────────────────────────────────────────────────────────

describe('Modal – overlay click', () => {
  it('calls onClose when closeOnOverlay=true and overlay is clicked', () => {
    const onClose = vi.fn();
    render(<Modal title="T" footer={null} onClose={onClose} closeOnOverlay><span /></Modal>);
    // The overlay is the outermost div (.modal-overlay)
    const overlay = screen.getByRole('dialog').parentElement!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when closeOnOverlay=false', () => {
    const onClose = vi.fn();
    render(<Modal title="T" footer={null} onClose={onClose} closeOnOverlay={false}><span /></Modal>);
    const overlay = screen.getByRole('dialog').parentElement!;
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── size / variant CSS classes ───────────────────────────────────────────────

describe('Modal – CSS classes', () => {
  it('applies modal-md by default', () => {
    render(<Modal title="T" footer={null}><span /></Modal>);
    expect(screen.getByRole('dialog').className).toContain('modal-md');
  });

  it('applies modal-sm for size="sm"', () => {
    render(<Modal title="T" footer={null} size="sm"><span /></Modal>);
    expect(screen.getByRole('dialog').className).toContain('modal-sm');
  });

  it('applies modal-danger for variant="danger"', () => {
    render(<Modal title="T" footer={null} variant="danger"><span /></Modal>);
    expect(screen.getByRole('dialog').className).toContain('modal-danger');
  });

  it('does NOT apply modal-danger for default variant', () => {
    render(<Modal title="T" footer={null}><span /></Modal>);
    expect(screen.getByRole('dialog').className).not.toContain('modal-danger');
  });
});

// ─── Escape key ───────────────────────────────────────────────────────────────

describe('Modal – Escape key', () => {
  it('calls onClose on Escape when closeOnEscape defaults to closeOnOverlay (true)', () => {
    const onClose = vi.fn();
    render(<Modal title="T" footer={null} onClose={onClose} closeOnOverlay><span /></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose on Escape when closeOnEscape=false', () => {
    const onClose = vi.fn();
    render(<Modal title="T" footer={null} onClose={onClose} closeOnEscape={false}><span /></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
