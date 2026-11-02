// Loading the data pack: wrong files get a plain message, a right one loads (no private data needed).
import { describe, expect, it } from 'vitest';
import { lib, loadPackFile } from '../src/data/libraryStore.ts';

describe('data pack file', () => {
  it('refuses a file that is not a data pack, in plain words', async () => {
    await expect(loadPackFile(new Blob(['%PDF-1.7 not a pack']))).rejects.toThrow('not a Whole building LCA data pack');
    await expect(loadPackFile(new Blob([JSON.stringify({ schema: 'something-else' })]))).rejects.toThrow('not a Whole building LCA data pack');
  });
  it('tells a project file apart from the pack', async () => {
    await expect(loadPackFile(new Blob([JSON.stringify({ schema: 'wblca-project@1' })]))).rejects.toThrow('project file');
  });
  it('loads a pack, also when it is not compressed', async () => {
    const pack = { schema: 'wblca-pack@1', title: 'Test pack', created: '2026-11-03', libs: { IDEMAT: { title: 'IDEMAT test', rows: [] } } };
    const m = await loadPackFile(new Blob([JSON.stringify(pack)]));
    expect(m.title).toBe('Test pack');
    expect(lib.info.IDEMAT?.origin).toBe('private');
  });
});
