import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './components/AuthGate.jsx';
import RootErrorBoundary from './components/RootErrorBoundary.jsx';
import GlobalCrashGuard from './components/GlobalCrashGuard.jsx';
import PwaUpdatePrompt from './components/PwaUpdatePrompt.jsx';
import MaintenanceNotice from './components/MaintenanceNotice.jsx';
import './index.css';

const container = document.getElementById('root');

// Drop the pre-JavaScript shell (see the comment on #seo-shell in index.html)
// before React's first render rather than leaving it to React's own container
// clear. Two reasons to be explicit: the removal is then a documented step
// someone can find when they wonder where the static HTML went, and it happens
// in this tick rather than in React's commit phase, so there is no frame where
// the shell and a mounting app are both in the DOM.
container?.querySelector('#seo-shell')?.remove();

// Site-wide "down for maintenance" switch. Flip to true to show
// MaintenanceNotice instead of the app; false to run the app normally.
// To turn the maintenance page on/off, just flip this boolean.
const MAINTENANCE_MODE = false;

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    {MAINTENANCE_MODE ? (
      <MaintenanceNotice />
    ) : (
      <GlobalCrashGuard>
        <RootErrorBoundary>
          <PwaUpdatePrompt />
          <AuthGate>
            {({ user, setUser, openLegal }) => (
              <App account={user} onAccountChange={setUser} onOpenLegal={openLegal} />
            )}
          </AuthGate>
        </RootErrorBoundary>
      </GlobalCrashGuard>
    )}
  </React.StrictMode>
);
