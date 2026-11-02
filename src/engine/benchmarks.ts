// Published embodied-carbon benchmarks, for context only. Their scope (whole building incl. services and finishes) is wider than
// the LEED BD+C LCA scope (structure + enclosure) or the ID+C scope (interior fit-out), so a LEED result normally sits lower.
export interface Benchmark {
  id: string;
  label: string;
  metric: 'upfront' | 'wholelife';
  scope: string;
  lines: { v: number; label: string }[];
  source: string;
  url: string;
}

export const BENCHMARKS: Benchmark[] = [
  {
    id: 'leti-nd', label: 'LETI – non-domestic (offices)', metric: 'upfront',
    scope: 'Upfront carbon A1–A5, whole building incl. services and finishes, excl. sequestration',
    lines: [{ v: 1000, label: 'Current benchmark' }, { v: 600, label: '2020 best practice (band C)' }, { v: 350, label: '2030 target (band A)' }],
    source: 'LETI Climate Emergency Design Guide (2020)', url: 'https://www.leti.uk/cedg',
  },
  {
    id: 'leti-d', label: 'LETI – domestic', metric: 'upfront',
    scope: 'Upfront carbon A1–A5, whole building incl. services and finishes, excl. sequestration',
    lines: [{ v: 800, label: 'Current benchmark' }, { v: 500, label: '2020 best practice' }, { v: 300, label: '2030 target' }],
    source: 'LETI Climate Emergency Design Guide (2020)', url: 'https://www.leti.uk/cedg',
  },
  {
    id: 'riba-nd', label: 'RIBA 2030 Climate Challenge – non-domestic', metric: 'wholelife',
    scope: 'Embodied carbon A–C (RICS whole life carbon), whole building',
    lines: [{ v: 1100, label: 'Business as usual' }, { v: 800, label: '2020 target' }, { v: 650, label: '2025 target' }, { v: 500, label: '2030 target' }],
    source: 'RIBA 2030 Climate Challenge (2019), as tabulated in Bristol City Council, Net zero building policy evidence base: embodied carbon (Jan 2022)',
    url: 'https://www.architecture.com/-/media/files/climate-action/riba-2030-climate-challenge.pdf',
  },
  {
    id: 'riba-d', label: 'RIBA 2030 Climate Challenge – domestic', metric: 'wholelife',
    scope: 'Embodied carbon A–C (RICS whole life carbon), whole building',
    lines: [{ v: 1000, label: 'Business as usual' }, { v: 600, label: '2020 target' }, { v: 450, label: '2025 target' }, { v: 300, label: '2030 target' }],
    source: 'RIBA 2030 Climate Challenge (2019), as tabulated in Bristol City Council, Net zero building policy evidence base: embodied carbon (Jan 2022)',
    url: 'https://www.architecture.com/-/media/files/climate-action/riba-2030-climate-challenge.pdf',
  },
];
