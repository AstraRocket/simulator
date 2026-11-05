import { must } from './services/app/must';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SettingsProvider } from './state/SettingsProvider';
import { useEngineStore } from './state/engineStore';
import './index.css';
import './i18n';
import { applyTheme } from './services/app/theme';
import { loadSettings } from './services/storage/settings';
import { warmCatalogs } from './services/app/warmCatalogs';

// Not awaited: a stalled engine fetch must not keep the UI from appearing.
useEngineStore.getState().start();

// Before anything paints, so a light user does not see a dark first frame.
applyTheme(loadSettings().theme);

ReactDOM.createRoot(must(document.getElementById('root'), 'root element')).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>,
);

warmCatalogs();
