import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/baloo-2';
import './styles/main.scss';
import App from './app.jsx';

// dev builds (npm run dev) get a marked tab title so the local environment is
// easy to tell apart from the live GitHub Pages site when both are open. this is
// stripped from production builds — import.meta.env.DEV is false under `vite build`.
if (import.meta.env.DEV) {
  document.title = `🚧 DEV · ${document.title}`;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);