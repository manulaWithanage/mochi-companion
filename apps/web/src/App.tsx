import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { StopwatchCard } from './components/StopwatchCard';
import { ProjectAnalyticsCard } from './components/ProjectAnalyticsCard';
import { LifestyleCard } from './components/LifestyleCard';
import { SkinGalleryCard } from './components/SkinGalleryCard';
import { DeepLinkPairingModal } from './components/DeepLinkPairingModal';

export function App() {
  const [view, setView] = useState<'landing' | 'dashboard'>('landing');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);

  // If viewing the Landing Page, show the full interactive Landing Page experience!
  if (view === 'landing') {
    return <LandingPage onGoToDashboard={() => setView('dashboard')} />;
  }

  // Dashboard View
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 'dashboard') setView('dashboard');
          setActiveTab(tab);
        }}
        onOpenPairing={() => setIsPairingModalOpen(true)}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header onOpenPairing={() => setIsPairingModalOpen(true)} />

        <main style={{ padding: '32px', flex: 1, display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          {/* Top Return to Landing Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setView('landing')}
              className="btn-secondary"
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              ⬅️ Back to Landing Page
            </button>
          </div>

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
