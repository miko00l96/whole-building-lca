// The EPD library, IDEMAT and ecoinvent are licensed, so the site publishes only ÖKOBAUDAT: the other three come from the
// user's own data pack file. This note says so where materials are chosen, and loads the file with one click or a drop.
import { useState, type CSSProperties } from 'react';
import { useApp } from '../../state/store.ts';
import { loadPackFile, packMeta } from '../../data/libraryStore.ts';
import { pickFile } from '../../state/project.ts';
import { Icon } from '../icons.tsx';
import type { Src } from '../../engine/types.ts';

const PRIVATE: Src[] = ['EPD', 'IDEMAT', 'ecoinvent'];

/** Load a data pack: the file given (dropped) or one the user chooses. Any file can be chosen, because phones grey out
 *  file types they do not know; the content is checked instead. */
export async function choosePack(file?: File | null): Promise<boolean> {
  const f = file ?? (await pickFile(''));
  if (!f) return false;
  const { recompute, toast } = useApp.getState();
  try {
    const m = await loadPackFile(f);
    recompute();
    const got = PRIVATE.filter((s) => m.counts[s]).map((s) => `${s} ${m.counts[s]!.toLocaleString('en-GB')}`).join(', ');
    toast(`Data pack loaded (${got}). This browser keeps it for next time.`);
    // ask the browser not to clear this site's storage (the pack and the projects) when the disk runs low
    navigator.storage?.persist?.().catch(() => undefined);
    return true;
  } catch (e: any) {
    toast(e?.message ?? 'This file could not be read.');
    return false;
  }
}

/** One band across the top of every sheet while the pack is not in this browser: the app reopens the last project, so
 *  the note on the Projects page alone is easy to miss. */
export function PackBanner() {
  useApp((s) => s.libVersion);
  const [hidden, setHidden] = useState(false);
  if (packMeta || hidden) return null;
  return (
    <div className="pack-band" role="note">
      <span className="pb-text"><b>EPD library, IDEMAT and ecoinvent are not loaded in this browser.</b> Only ÖKOBAUDAT comes with the site; the other three are in your data pack file (.wblca).</span>
      <button className="btn sm primary" onClick={() => choosePack()}><Icon.upload /> Load the data pack</button>
      <span className="pb-drop">or drop the file on the page</span>
      <button className="icon-btn" title="Hide until the page is reloaded" aria-label="Hide this note" onClick={() => setHidden(true)}><Icon.x /></button>
    </div>
  );
}

export function PackPrompt({ compact = false, style }: { compact?: boolean; style?: CSSProperties }) {
  useApp((s) => s.libVersion); // hides itself once the pack is in
  if (packMeta) return null;
  if (compact)
    return (
      <div className="pack-prompt compact" style={style}>
        <span>EPD library, IDEMAT and ecoinvent are not loaded in this browser.</span>
        <button className="link-btn" onClick={() => choosePack()}>Load the data pack</button>
      </div>
    );
  return (
    <section className="pack-prompt" style={style} aria-label="Private libraries">
      <div className="pp-text">
        <div className="pp-title">EPD library, IDEMAT and ecoinvent are not loaded in this browser</div>
        <p>They are licensed, so the site publishes only ÖKOBAUDAT. The other three come from your data pack file (.wblca). Load it once and this browser keeps it.</p>
      </div>
      <div className="pp-act">
        <button className="btn primary" onClick={() => choosePack()}><Icon.upload /> Load the data pack</button>
        <span className="pp-drop">or drop the file anywhere on the page</span>
      </div>
    </section>
  );
}
