import type { JSX } from 'preact';
import { isDemo } from './api';
import { ErrorState, Mark, Sep } from './components/atoms';
import { href, useRoute, useScrollReset } from './router';
import { Case } from './screens/Case';
import { Search } from './screens/Search';
import { Status } from './screens/Status';
import { useApi } from './useAsync';

export function App(): JSX.Element {
  const route = useRoute();
  useScrollReset(JSON.stringify(route));
  const version = useApi('version', (client) => client.version());
  const demo = isDemo();

  return (
    <>
      <header class="topbar">
        <a class="brand" href={href('')} aria-label="Molao — home">
          <Mark />
          <span>
            m<span class="o">o</span>lao
          </span>
        </a>
        <nav class="nav" aria-label="Primary">
          <a href={href('')} aria-current={route.name === 'search' ? 'page' : undefined}>
            Search
          </a>
          <a href={href('status')} aria-current={route.name === 'status' ? 'page' : undefined}>
            Status
          </a>
        </nav>
        <span class="spacer" />
        <div class="meta">
          {demo && (
            <span
              class="badge apex"
              title="Fictional judgments, bundled with the UI. Nothing here is real law and no node is running."
            >
              <span class="dot" aria-hidden="true" />
              demo corpus
            </span>
          )}
          <span class="mono dim hide-sm">
            {version.data ? `${version.data.version}` : 'offline'}
          </span>
        </div>
      </header>

      <main>
        {route.name === 'search' && (
          <Search
            q={route.q}
            court={route.court}
            region={route.region}
            yearFrom={route.yearFrom}
            yearTo={route.yearTo}
          />
        )}
        {route.name === 'case' && <Case id={route.id} tab={route.tab} para={route.para} />}
        {route.name === 'status' && <Status />}
        {route.name === 'notfound' && (
          <ErrorState title="No such page" detail={`Nothing is routed at /${route.path}.`} />
        )}
      </main>

      <footer class="footer">
        <span>A decentralized commons of case law.</span>
        <Sep />
        <span class="mono">
          {demo ? 'fictional demo corpus — not law' : 'served by a local molao node'}
        </span>
        <span style="flex:1" />
        <span class="mono">
          verifies bytes and signatures, not legal correctness
        </span>
      </footer>
    </>
  );
}
