import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../markdownParser';

describe('renderMarkdown', () => {
  it('renders the supported block and inline formats', () => {
    render(<>{renderMarkdown([
      '# Titre',
      'Paragraphe **fort** et *italique* avec `code`.',
      '- premier',
      '- second',
      '1. étape une',
      '2. étape deux',
      '> rappel',
    ].join('\n'))}</>);

    expect(screen.getByRole('heading', { name: 'Titre' })).toBeInTheDocument();
    expect(screen.getByText('fort', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('italique', { selector: 'em' })).toBeInTheDocument();
    expect(screen.getByText('code', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getByText('rappel', { selector: 'blockquote' })).toBeInTheDocument();
  });

  it('renders markup-looking input as text instead of executable HTML', () => {
    const { container } = render(<>{renderMarkdown('<img src=x onerror=alert(1)>')}</>);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });

  it('ignores separators and blank lines', () => {
    const { container } = render(<>{renderMarkdown('avant\n\n---\naprès')}</>);

    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelector('hr')).toBeNull();
  });
});
