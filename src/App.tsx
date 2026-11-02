import { Suspense, useEffect, useState } from 'react';
import { Shell } from './ui/Shell.tsx';
import { useApp } from './state/store.ts';
import { loadPublic, restorePack } from './data/libraryStore.ts';
import { lastProjectId, loadProjectLocal } from './state/project.ts';
import { projectFromHash } from './state/share.ts';
import { StartPage } from './ui/pages/StartPage.tsx';
import { SetupPage } from './ui/pages/SetupPage.tsx';
import { BoqPage } from './ui/pages/BoqPage.tsx';
import { DesignsPage } from './ui/pages/DesignsPage.tsx';
import { ResultsPage } from './ui/pages/ResultsPage.tsx';
import { DashboardPage } from './ui/pages/DashboardPage.tsx';
import { InsightsPage } from './ui/pages/InsightsPage.tsx';
import { ContractorPage } from './ui/pages/ContractorPage.tsx';
import { FinderPage } from './ui/pages/FinderPage.tsx';
import { DataPage } from './ui/pages/DataPage.tsx';
import { ReportPage } from './ui/pages/ReportPage.tsx';


export function App() {
  const { page, project, recompute, openProject } = useApp();
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      try {
        await loadPublic();
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      }
      await restorePack();
      let shared = null;
      try { shared = await projectFromHash(location.hash); } catch { /* not a project link */ }
      if (shared) {
        history.replaceState(null, '', location.pathname + location.search);
        openProject(shared, 'results');
        useApp.getState().toast('Opened a shared project as a new project in this browser.');
      } else {
        const id = await lastProjectId();
        const p = id ? await loadProjectLocal(id) : null;
        if (p) openProject(p, p.boq.length ? 'designs' : 'setup');
        else recompute();
      }
      setReady(true);
    })();
  }, []);
  if (!ready) return <div className="empty" style={{ paddingTop: 120 }}><h3>Loading the libraries…</h3><p className="muted">ÖKOBAUDAT and your data pack, if this browser has one.</p></div>;
  const pg = !project && !['start', 'finder', 'data'].includes(page) ? 'start' : page;
  return (
    <Shell>
      {err && <div className="note bad" style={{ margin: 16 }}>{err}</div>}
      <Suspense fallback={<div className="empty">Loading…</div>}>
        {pg === 'start' && <StartPage />}
        {pg === 'setup' && <SetupPage />}
        {pg === 'boq' && <BoqPage />}
        {pg === 'designs' && <DesignsPage />}
        {pg === 'results' && <ResultsPage />}
        {pg === 'dashboard' && <DashboardPage />}
        {pg === 'insights' && <InsightsPage />}
        {pg === 'report' && <ReportPage />}
        {pg === 'contractor' && <ContractorPage />}
        {pg === 'finder' && <FinderPage />}
        {pg === 'data' && <DataPage />}
      </Suspense>
    </Shell>
  );
}
