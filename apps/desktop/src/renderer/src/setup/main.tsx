import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Setup } from './Setup.js';

const container = document.getElementById('root');
if (container === null) throw new Error('setup root element missing');

createRoot(container).render(
  <StrictMode>
    <Setup />
  </StrictMode>,
);
