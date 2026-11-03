import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Schriften lokal, damit OBS keine externen Anfragen stellt.
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-ext-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-ext-600.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-ext-600.css';

import '../styles/base.css';
import '../styles/components.css';
import '../styles/views.css';
import '../styles/ausgabe.css';

import { Output, readOptions } from './Output.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Output options={readOptions(window.location.search)} />
  </StrictMode>,
);
