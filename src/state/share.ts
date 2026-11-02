// Project links: the whole project, compressed into the address after '#p='. The link carries the building and the
// material choices, not the people: assessor, company, client and logo are left out. Nothing is sent to a server.
import type { Project } from '../engine/types.ts';
import { cloneProject, migrate } from './project.ts';

const b64url = (u8: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const u8 = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
  return u8;
};

export async function projectLink(p: Project): Promise<string> {
  const c = cloneProject(p, false);
  c.setup.assessor = '';
  c.setup.company = '';
  c.setup.client = '';
  c.setup.logo = null;
  const stream = new Blob([JSON.stringify(c)]).stream().pipeThrough(new CompressionStream('gzip'));
  const gz = new Uint8Array(await new Response(stream).arrayBuffer());
  return `${location.origin}${location.pathname}#p=${b64url(gz)}`;
}

/** The project in the address, if any, as a new project of this browser. */
export async function projectFromHash(hash: string): Promise<Project | null> {
  if (!hash.startsWith('#p=')) return null;
  const stream = new Blob([unb64url(hash.slice(3))]).stream().pipeThrough(new DecompressionStream('gzip'));
  const p = JSON.parse(await new Response(stream).text()) as Project;
  if (p?.schema !== 'wblca-project@1') return null;
  return cloneProject(migrate(p), true);
}
