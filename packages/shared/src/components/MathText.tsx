import { Fragment } from 'react';
import katex from 'katex';

type MathPart =
  | { type: 'text'; value: string }
  | { type: 'math'; value: string; display: boolean };

function splitInline(text: string): MathPart[] {
  const parts: MathPart[] = [];
  const inlineRegex = /\$([^$\n]+?)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'math', value: match[1], display: false });
    lastIndex = inlineRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return parts;
}

function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  const blockRegex = /\$\$([\s\S]+?)\$\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...splitInline(text.slice(lastIndex, match.index)));
    }
    parts.push({ type: 'math', value: match[1], display: true });
    lastIndex = blockRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(...splitInline(text.slice(lastIndex)));
  }
  return parts;
}

function renderMath(latex: string, display: boolean): string {
  return katex.renderToString(latex, { throwOnError: false, displayMode: display });
}

interface MathTextProps {
  text: string;
}

export function MathText({ text }: MathTextProps) {
  const parts = splitMath(text);

  if (parts.length === 1 && parts[0].type === 'text') {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <Fragment key={i}>{part.value}</Fragment>;
        }
        return (
          <span
            key={i}
            className={part.display ? 'math-block' : 'math-inline'}
            style={part.display ? { display: 'block', margin: '0.5rem 0' } : undefined}
            dangerouslySetInnerHTML={{ __html: renderMath(part.value, part.display) }}
          />
        );
      })}
    </>
  );
}
