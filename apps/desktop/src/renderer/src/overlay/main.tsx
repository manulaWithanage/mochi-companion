import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Overlay } from './Overlay.js';

const container = document.getElementById('root');
if (container === null) throw new Error('overlay root element missing');

createRoot(container).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
