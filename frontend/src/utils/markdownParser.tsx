export function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="support-msg-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={i} className="support-msg-h3">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('## ') || line.startsWith('# ')) {
      const content = line.startsWith('## ') ? line.slice(3) : line.slice(2);
      nodes.push(
        <h2 key={i} className="support-msg-h2">
          {content}
        </h2>
      );
    } else if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="support-msg-list">
          {items.map((item, j) => (
            <li key={j}>{inlineFormat(item)}</li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="support-msg-list support-msg-list--ordered">
          {items.map((item, j) => (
            <li key={j}>{inlineFormat(item)}</li>
          ))}
        </ol>
      );
      continue;
    } else if (line.startsWith('> ')) {
      nodes.push(
        <blockquote key={i} className="support-msg-blockquote">
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
    } else if (line.trim() === '' || line.trim() === '---') {
      // skip empty lines and hr
    } else {
      nodes.push(
        <p key={i} className="support-msg-p">
          {inlineFormat(line)}
        </p>
      );
    }
    i++;
  }

  return nodes;
}
