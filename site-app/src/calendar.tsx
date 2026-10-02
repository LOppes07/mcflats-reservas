import { useEffect, useMemo, useRef, useState } from 'react';
import { css, Box } from './css';

/**
 * Calendário de disponibilidade + tarifa por noite, no idioma visual do MC Flats
 * (helper css()/Box, sem Tailwind). Porta a ideia do componente shadcn de "pricing
 * calendar" (react-day-picker) para a stack de estilos inline do site:
 *  - datas passadas e ocupadas ficam desabilitadas (riscadas);
 *  - mostra o preço da diária em cada dia livre;
 *  - seleção de período estilo Airbnb (clica entrada, depois saída), com preview no hover;
 *  - respeita a estadia mínima e não deixa cruzar uma noite ocupada.
 * As datas ocupadas vêm de /api/public/availability (mesmo formato do card).
 */

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const LABEL = "font:700 11px/1 'Montserrat',sans-serif; color:#9aa9bb;";

export type Occupied = { start: string; end: string };

function Chevron({ dir, disabled, onClick }: { dir: 'left' | 'right'; disabled?: boolean; onClick: () => void }) {
  const d = dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6';
  return (
    <Box
      onClick={disabled ? undefined : onClick}
      aria-label={dir === 'left' ? 'Mês anterior' : 'Próximo mês'}
      style={`width:34px; height:34px; border-radius:9px; display:flex; align-items:center; justify-content:center; ${disabled ? 'opacity:.3; cursor:default;' : 'cursor:pointer; color:#1c3a5f;'}`}
      hover={disabled ? undefined : 'background:#f2f7fc;'}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </Box>
  );
}

export function PriceCalendar({
  price, occupied = [], minNights = 1, minAdvanceDays = 1, checkin, checkout, onSelect,
}: {
  price?: number;
  occupied?: Occupied[];
  minNights?: number;
  minAdvanceDays?: number;
  checkin: string;
  checkout: string;
  onSelect: (checkin: string, checkout: string) => void;
}) {
  const minDay = iso(new Date(Date.now() + Math.max(0, minAdvanceDays) * 86400000)); // antecedência mínima (config.)
  const start0 = (checkin && checkin >= minDay ? checkin : minDay);
  const [view, setView] = useState(() => { const d = parse(start0); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [anchor, setAnchor] = useState<string | null>(null); // entrada escolhida durante a seleção
  const [hover, setHover] = useState<string | null>(null);

  // Conjunto de noites ocupadas (expande cada intervalo inclusivo).
  const occ = useMemo(() => {
    const set = new Set<string>();
    for (const { start, end } of occupied) {
      let c = start, guard = 0;
      while (c <= end && guard < 400) { set.add(c); c = addDays(c, 1); guard++; }
    }
    return set;
  }, [occupied]);

  // Todas as noites de [a, b) estão livres? (b é a saída, não é noite dormida.)
  const rangeFree = (a: string, b: string) => {
    let c = a; while (c < b) { if (occ.has(c)) return false; c = addDays(c, 1); } return true;
  };

  const minMonth = { y: new Date().getFullYear(), m: new Date().getMonth() };
  const atMinMonth = view.y === minMonth.y && view.m === minMonth.m;
  const go = (delta: number) => setView((v) => {
    const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() };
  });

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstWeekday = new Date(view.y, view.m, 1).getDay();

  // período em exibição: durante a seleção usa o anchor + hover; senão o valor confirmado.
  const selStart = anchor ?? checkin;
  const previewEnd = anchor
    ? (hover && hover > anchor && rangeFree(anchor, hover) && diffDays(anchor, hover) >= minNights ? hover : null)
    : checkout;

  const pick = (day: string) => {
    if (day < minDay || occ.has(day)) return;
    if (!anchor) { setAnchor(day); return; }
    if (day <= anchor || !rangeFree(anchor, day) || diffDays(anchor, day) < minNights) { setAnchor(day); return; }
    onSelect(anchor, day);
    setAnchor(null); setHover(null);
  };

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${view.y}-${pad(view.m + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={css("background:#fff; border:1px solid #e2ebf4; border-radius:14px; padding:14px;")}>
      <div style={css('display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;')}>
        <Chevron dir="left" disabled={atMinMonth} onClick={() => go(-1)} />
        <div style={css("font:700 14px/1 'Montserrat',sans-serif; color:#1c3a5f; text-transform:capitalize;")}>{MONTHS[view.m]} {view.y}</div>
        <Chevron dir="right" onClick={() => go(1)} />
      </div>

      <div style={css('display:grid; grid-template-columns:repeat(7,1fr); margin-bottom:4px;')}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={css("text-align:center; font:700 10px/1 'Montserrat',sans-serif; letter-spacing:.03em; text-transform:uppercase; color:#9aa9bb; padding:6px 0;")}>{w}</div>
        ))}
      </div>

      <div style={css('display:grid; grid-template-columns:repeat(7,1fr); gap:2px;')} onMouseLeave={() => setHover(null)}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const dn = parse(day).getDate();
          const isPast = day < minDay;
          const isOcc = occ.has(day);
          const disabled = isPast || isOcc;
          const isStart = !!selStart && day === selStart;
          const isEnd = !!previewEnd && day === previewEnd;
          const isMiddle = !!selStart && !!previewEnd && day > selStart && day < previewEnd;

          let cell = "position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; height:42px; border-radius:9px; ";
          if (disabled) {
            cell += `cursor:default; color:#c4cede; ${isOcc ? 'text-decoration:line-through;' : ''}`;
          } else if (isStart || isEnd) {
            cell += 'cursor:pointer; background:#15499a; color:#fff; box-shadow:0 4px 12px -4px rgba(21,73,154,.55);';
          } else if (isMiddle) {
            cell += 'cursor:pointer; background:#eaf2fb; color:#1c3a5f; border-radius:0;';
          } else {
            cell += 'cursor:pointer; color:#1c3a5f;';
          }

          return (
            <Box
              key={day}
              onClick={disabled ? undefined : () => pick(day)}
              onMouseEnter={() => !disabled && setHover(day)}
              aria-label={day}
              aria-disabled={disabled}
              style={cell}
              hover={disabled || isStart || isEnd || isMiddle ? undefined : 'background:#f2f7fc;'}
            >
              <span style={css("font:600 13px/1 'Manrope',sans-serif;")}>{dn}</span>
              {!disabled && price ? (
                <span style={css(`font:600 9px/1 'Manrope',sans-serif; margin-top:3px; color:${isStart || isEnd ? 'rgba(255,255,255,.85)' : '#9aa9bb'};`)}>
                  {price}
                </span>
              ) : null}
            </Box>
          );
        })}
      </div>

      <div style={css('display:flex; align-items:center; justify-content:space-between; margin-top:12px; padding-top:12px; border-top:1px solid #eef3f8;')}>
        <span style={css(LABEL)}>
          {anchor ? 'Escolha a data de saída' : (checkin && checkout ? `${diffDays(checkin, checkout)} noite(s) selecionada(s)` : 'Escolha as datas')}
        </span>
        {minNights > 1 && <span style={css("font:600 11px/1 'Manrope',sans-serif; color:#9aa9bb;")}>mín. {minNights} noites</span>}
      </div>
    </div>
  );
}

const fmtBR = (iso: string) => {
  const [y, m, d] = (iso || '').split('-');
  return y ? `${d}/${m}/${y}` : '—';
};

/**
 * Campos Check-in / Check-out da barra de busca, com um popover do calendário
 * estilizado (o mesmo do card do imóvel) no lugar do date picker nativo do navegador.
 */
export function DateRangeField({
  checkin, checkout, onSelect, mobile = false, minAdvanceDays = 1,
}: {
  checkin: string;
  checkout: string;
  onSelect: (checkin: string, checkout: string) => void;
  mobile?: boolean;
  minAdvanceDays?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const label = "font:700 10.5px/1 'Montserrat',sans-serif; letter-spacing:.1em; text-transform:uppercase; color:#a8842c; margin-bottom:8px;";
  const val = "font:600 15px/1.1 'Manrope',sans-serif; color:#1c3a5f;";
  const field = 'flex:1; padding:12px 22px; display:flex; flex-direction:column; justify-content:center; cursor:pointer; min-width:0;';
  const divider = `width:1px; background:#e7eef5; margin:8px 0; display:${mobile ? 'none' : 'block'};`;

  return (
    <div ref={ref} style={css(`position:relative; display:flex; flex:2; flex-direction:${mobile ? 'column' : 'row'};`)}>
      <Box onClick={() => setOpen((o) => !o)} style={field}>
        <div style={css(label)}>Check-in</div>
        <div style={css(val)}>{fmtBR(checkin)}</div>
      </Box>
      <div style={css(divider)} />
      <Box onClick={() => setOpen((o) => !o)} style={field}>
        <div style={css(label)}>Check-out</div>
        <div style={css(val)}>{fmtBR(checkout)}</div>
      </Box>
      {open && (
        <div style={css(`position:absolute; top:calc(100% + 12px); left:${mobile ? '0' : '10px'}; z-index:40; width:${mobile ? '100%' : '320px'}; box-shadow:0 24px 60px -18px rgba(28,58,95,.4); border-radius:14px;`)}>
          <PriceCalendar
            checkin={checkin}
            checkout={checkout}
            minAdvanceDays={minAdvanceDays}
            onSelect={(ci, co) => { onSelect(ci, co); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}
