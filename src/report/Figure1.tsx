// Figure 1 of the report: the EN 15978 life-cycle modules, drawn from one list of boxes as SVG (preview, print) and as a
// PNG (Word). Same layout and colours as the text-box diagram of the Excel Report sheet.
interface Sty { fill: string; color: string; line?: string }
const INC: Sty = { fill: '#2a7a4b', color: '#ffffff' };
const SEP: Sty = { fill: '#cde6d6', color: '#17402b' };
const EXC: Sty = { fill: '#eef0ee', color: '#7e8682', line: '#c9cfcb' };
const HEAD: Sty = { fill: '#17402b', color: '#ffffff' };
const FONT = 'Calibri, Carlito, "Segoe UI", sans-serif';

interface Box { x: number; y: number; w: number; h: number; lines: string[]; s: Sty; size: number; bold: boolean; rot: boolean }

export const FIG_W = 740;
export const FIG_H = 334;

function boxes(): Box[] {
  const STEP = 45, MW = 42;
  const out: Box[] = [];
  const box = (x: number, y: number, w: number, h: number, text: string | string[], s: Sty, size = 12, bold = false, rot = false) =>
    out.push({ x, y, w, h, lines: Array.isArray(text) ? text : [text], s, size, bold, rot });
  const MODS: [string, string, Sty][] = [['A1', 'Raw material supply', INC], ['A2', 'Transport', INC], ['A3', 'Manufacturing', INC],
    ['A4', 'Transport to site', INC], ['A5', 'Construction / installation', EXC], ['B1', 'Use', EXC], ['B2', 'Maintenance', EXC],
    ['B3', 'Repair', EXC], ['B4', 'Replacement', INC], ['B5', 'Refurbishment', INC], ['C1', 'Deconstruction / demolition', INC],
    ['C2', 'Transport', INC], ['C3', 'Waste processing', INC], ['C4', 'Disposal', INC]];
  for (const [i0, n, t] of [[0, 5, 'Pre-use phase  ·  upfront carbon'], [5, 5, 'Use phase  ·  operational carbon'], [10, 4, 'Post-use phase  ·  end of life']] as const)
    box(i0 * STEP, 0, n * STEP - 3, 32, t, HEAD, 12, true);
  const DX = 14 * STEP + 5, DW = 738 - DX;
  box(DX, 0, DW, 32, ['Beyond the', 'life cycle'], HEAD, 11.5, true);
  MODS.forEach(([code, name, s], i) => {
    box(i * STEP, 34, MW, 24, code, s, 13.3, true);
    box(i * STEP, 62, MW, 190, name, s, 12, false, true);
  });
  box(DX, 34, DW, 24, 'D', SEP, 13.3, true);
  box(DX, 62, DW, 190, ['Benefits and loads beyond', 'the system boundary', '(reported separately)'], SEP, 12, false, true);
  const bx = 5 * STEP, rw = 13 * STEP + MW - bx - STEP;
  box(bx, 258, MW, 24, 'B6', SEP, 13.3, true);
  box(bx + STEP, 258, rw, 24, 'Operational energy use – reported separately', SEP, 12);
  box(bx, 286, MW, 24, 'B7', EXC, 13.3, true);
  box(bx + STEP, 286, rw, 24, 'Operational water use – not included', EXC, 12);
  box(0, 258, 216, 22, 'Included in the system boundary', INC, 11.3);
  box(0, 284, 216, 22, 'Reported separately (not in LEED totals)', SEP, 11.3);
  box(0, 310, 216, 22, 'Not included in the system boundary', EXC, 11.3);
  return out;
}

export function Figure1() {
  return (
    <svg className="rpt-fig1" viewBox={`0 0 ${FIG_W} ${FIG_H}`} role="img" aria-label="Life-cycle stages included in the system boundary (EN 15978 modules)">
      {boxes().map((b, k) => {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2, lh = b.size * 1.18;
        return (
          <g key={k}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.s.fill} stroke={b.s.line ?? 'none'} strokeWidth={b.s.line ? 0.75 : 0} />
            <g transform={`translate(${cx} ${cy})${b.rot ? ' rotate(-90)' : ''}`}>
              {b.lines.map((t, j) => (
                <text key={j} x={0} y={(j - (b.lines.length - 1) / 2) * lh} textAnchor="middle" dominantBaseline="central"
                  fontFamily={FONT} fontSize={b.size} fontWeight={b.bold ? 700 : 400} fill={b.s.color}>{t}</text>
              ))}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** Figure 1 as a PNG data URL (scale = pixels per diagram unit). */
export async function figure1Png(scale = 2.5): Promise<string> {
  try {
    await Promise.all([document.fonts.load('12px Carlito'), document.fonts.load('bold 12px Carlito')]);
  } catch { /* the system font is used */ }
  const c = document.createElement('canvas');
  c.width = Math.round(FIG_W * scale);
  c.height = Math.round(FIG_H * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, FIG_W, FIG_H);
  for (const b of boxes()) {
    g.fillStyle = b.s.fill;
    g.fillRect(b.x, b.y, b.w, b.h);
    if (b.s.line) {
      g.strokeStyle = b.s.line;
      g.lineWidth = 0.75;
      g.strokeRect(b.x + 0.375, b.y + 0.375, b.w - 0.75, b.h - 0.75);
    }
    g.save();
    g.translate(b.x + b.w / 2, b.y + b.h / 2);
    if (b.rot) g.rotate(-Math.PI / 2);
    g.fillStyle = b.s.color;
    g.font = `${b.bold ? 'bold ' : ''}${b.size}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lh = b.size * 1.18;
    b.lines.forEach((t, j) => g.fillText(t, 0, (j - (b.lines.length - 1) / 2) * lh));
    g.restore();
  }
  return c.toDataURL('image/png');
}
