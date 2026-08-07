import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Hover, press and focus behaviour for every control in this window. Inline
// styles cannot express a pseudo-class, so this is the only place those states
// can live. See the file for why it uses element selectors rather than classes.
import './ui.css';
import { Setup } from './Setup.js';

const container = document.getElementById('root');
if (container === null) throw new Error('setup root element missing');

createRoot(container).render(
  <StrictMode>
    <Setup />
  </StrictMode>,
);
