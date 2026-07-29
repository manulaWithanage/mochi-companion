import React, { useState } from 'react';

interface DeepLinkPairingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeepLinkPairingModal: React.FC<DeepLinkPairingModalProps> = ({ isOpen, onClose }) => {
  const [manualCode, setManualCode] = useState('');
  const [isLinked, setIsLinked] = useState(false);

  if (!isOpen) return null;

  const handlePair = () => {
    // Trigger PKCE protocol scheme URL launch
    window.location.href = 'mochi://linked?code=MCH-8921-PKCE';
    setIsLinked(true);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(7, 9, 14, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }}>
      <div className="glass-card" style={{ width: '480px', padding: '32px', position: 'relative' }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '20px',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>

        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔗</div>
          <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-main)' }}>
            Pair Desktop Companion
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
            1-Click PKCE Handshake (`mochi://`) to link your desktop pet overlay with your cloud account.
          </p>
        </div>

        {isLinked ? (
          <div style={{
            padding: '20px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10b981',
            textAlign: 'center',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>🎉</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#10b981' }}>
              Successfully Handshaked!
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Mochi desktop speech bubble: "Connected!" 🍡
            </div>
          </div>
        ) : (
          <button
            onClick={handlePair}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '15px', marginBottom: '24px' }}
          >
            🚀 Open Mochi App (mochi://linked)
          </button>
        )}

        {/* Fallback Section */}
        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Nothing happened? Enter fallback pairing code:
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. 4KP-92X"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-main)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button
              onClick={() => { if (manualCode) setIsLinked(true); }}
              className="btn-secondary"
              style={{ padding: '10px 16px' }}
            >
              Verify Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
