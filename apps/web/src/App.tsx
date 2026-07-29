import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { StopwatchCard } from './components/StopwatchCard';
import { ProjectAnalyticsCard } from './components/ProjectAnalyticsCard';
import { LifestyleCard } from './components/LifestyleCard';
import { SkinGalleryCard } from './components/SkinGalleryCard';
import { DeepLinkPairingModal } from './components/DeepLinkPairingModal';

export function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenPairing={() => setIsPairingModalOpen(true)}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header onOpenPairing={() => setIsPairingModalOpen(true)} />

        <main style={{ padding: '32px', flex: 1, display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          {/* Top Row: Stopwatch & Time Analytics */}
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <StopwatchCard />
            <ProjectAnalyticsCard />
          </div>

          {/* Middle Row: Lifestyle Rhythm */}
          <div style={{ display: 'flex', gap: '24px' }}>
            <LifestyleCard />
          </div>

          {/* Bottom Row: Mascot Skin Gallery */}
          <div style={{ display: 'flex', gap: '24px' }}>
            <SkinGalleryCard />
          </div>
        </main>
      </div>

      {/* PKCE Deep-Link Handshake Modal */}
      <DeepLinkPairingModal
        isOpen={isPairingModalOpen}
        onClose={() => setIsPairingModalOpen(false)}
      />
    </div>
  );
}

export default App;
