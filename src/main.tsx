import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Schriften werden lokal mitgeliefert (keine Anfragen an externe Schriftdienste).
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-ext-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-ext-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-ext-600.css';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-ext-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';

import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/views.css';

import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
