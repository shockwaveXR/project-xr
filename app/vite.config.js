import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// production is served from the project-page path (repo `project-xr`) →
// https://shockwavexr.github.io/project-xr/. dev stays at '/' so local runs at
// a clean localhost:5173/. if a custom domain is added later, set this to '/'.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/project-xr/' : '/',
}));
