import React, { useState } from 'react';

/**
 * Mapeia as cores fixas da marca para tokens de tema (CSS variables), de forma
 * ciente da propriedade. No tema claro os tokens valem exatamente os hex atuais
 * (nada muda); no escuro, os tokens flipam — dando dark/light sem reescrever
 * cada estilo inline. Cores de marca (marinho/dourado) e brancos sobre imagem
 * permanecem fixos nos dois temas.
 */
const LINE = /#eef3f8|#e7eef5|#e2ebf4|#e3eaf2|#eadfce/gi;
function themeColors(prop: string, val: string): string {
  // linhas/bordas: seguras como substring (só aparecem como separadores)
  val = val.replace(LINE, 'var(--line)').replace(/#e4dccd/gi, 'var(--line-cream)').replace(/#d4e0ec/gi, 'var(--line-strong)');

  if (prop === 'color') {
    // texto: o branco (#fff) fica branco (é sempre sobre imagem/marinho)
    val = val.replace(/#1c3a5f/gi, 'var(--ink)').replace(/#42556b/gi, 'var(--ink-2)').replace(/#5a6b80/gi, 'var(--ink-2)').replace(/#9aa9bb/gi, 'var(--muted)');
  }
  if (prop === 'background' || prop === 'backgroundColor') {
    if (!val.includes('gradient') && !val.includes('url(')) {
      val = val
        .replace(/#ffffff\b|#fff\b/gi, 'var(--surface)')
        .replace(/rgba\(255,\s*255,\s*255,\s*\.9(2|5)?\)/gi, 'var(--surface-blur)')
        .replace(/#f7f3ec/gi, 'var(--surface-cream)')
        .replace(/#f2f7fc|#f6f9fc|#f7f9fc/gi, 'var(--surface-2)')
        .replace(/#eaf2fb/gi, 'var(--surface-accent)');
    }
  }
  return val;
}

/**
 * Parse a plain CSS declaration string (e.g. "color:#fff; padding:8px 12px;")
 * into a React style object. Lets us port the original inline-styled markup
 * almost verbatim instead of hand-converting hundreds of style objects.
 */
export function css(s: string): React.CSSProperties {
  const o: Record<string, string> = {};
  for (const decl of s.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim();
    if (!prop) continue;
    const val = themeColors(prop, decl.slice(idx + 1).trim());
    // -webkit-backdrop-filter -> WebkitBackdropFilter ; padding-top -> paddingTop
    o[prop.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = val;
  }
  return o as React.CSSProperties;
}

type BoxProps = {
  as?: keyof JSX.IntrinsicElements;
  style?: string;
  hover?: string;
  children?: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onClick?: (e?: any) => void;
} & Record<string, unknown>;

const NATIVE_INTERACTIVE = ['button', 'a', 'input', 'select', 'textarea', 'label'];

/**
 * Element that accepts CSS as strings and an optional `hover` style string.
 * Acessibilidade: quando tem onClick e NÃO é um elemento interativo nativo,
 * recebe role="button", tabIndex e ativação por teclado (Enter/Espaço).
 */
export function Box({ as = 'div', style = '', hover, children, onClick, ...rest }: BoxProps) {
  const [h, setH] = useState(false);
  const Tag = as as React.ElementType;
  const merged = hover && h ? { ...css(style), ...css(hover) } : css(style);
  const hoverProps = hover
    ? { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false) }
    : {};
  const a11y = onClick && !NATIVE_INTERACTIVE.includes(as as string)
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
        },
      }
    : {};
  return (
    <Tag style={merged} onClick={onClick} {...a11y} {...hoverProps} {...rest}>
      {children}
    </Tag>
  );
}
