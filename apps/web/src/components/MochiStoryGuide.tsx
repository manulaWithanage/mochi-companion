import React, { useEffect, useState } from 'react';
import { LandingMascotCanvas } from './LandingMascotCanvas';

interface MochiStoryGuideProps {
  readonly message: string;
  readonly state: 'idle' | 'working' | 'resting' | 'coffee';
}

/** A time-limited landing-page version of Mochi's desktop speech bubble. */
export const MochiStoryGuide: React.FC<MochiStoryGuideProps> = ({ message, state }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 5200);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <aside className={`mochi-story-guide ${visible ? 'is-visible' : ''}`} aria-live="polite">
      <div className="mochi-story-guide__bubble">
        {message}
        <span aria-hidden="true" />
      </div>
      <div className="mochi-story-guide__mascot" aria-hidden="true">
        <LandingMascotCanvas state={state} size={94} />
      </div>
    </aside>
  );
};
