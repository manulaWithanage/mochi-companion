import React from 'react';
import { MochiIcon } from './MochiIcon';

const linkStyle: React.CSSProperties = {
  color: '#45546a',
  fontSize: '13px',
  fontWeight: 650,
  lineHeight: 1.45,
  textDecoration: 'none',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 14px',
  color: '#6555dc',
  fontSize: '10px',
  fontWeight: 850,
  letterSpacing: '.13em',
};

const listStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px',
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

export const Footer: React.FC = () => {
  return (
    <footer
      className="site-footer"
      style={{
        position: 'relative',
        display: 'flex',
        minHeight: '690px',
        padding: '32px 24px 138px',
        alignItems: 'flex-end',
        background:
          "linear-gradient(to bottom, rgba(250,248,247,.12), rgba(250,248,247,.05) 40%, rgba(250,248,247,.15)), url('/morning-briefing-backdrop-v1.png') center bottom / cover no-repeat",
        color: '#122139',
        overflow: 'hidden',
      }}
    >
      <div
        className="site-footer__card"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(1120px, 100%)',
          margin: '0 auto',
          padding: 'clamp(26px, 4vw, 42px)',
          border: '1px solid rgba(55, 59, 87, .12)',
          borderRadius: '26px',
          background: 'rgba(255,255,255,.87)',
          boxShadow: '0 24px 60px rgba(54, 43, 62, .14), inset 0 1px rgba(255,255,255,.94)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
        }}
      >
        <div
          className="site-footer__columns"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(210px, 1.45fr) repeat(3, minmax(120px, 1fr))',
            gap: 'clamp(24px, 4vw, 56px)',
          }}
        >
          <div className="site-footer__brand">
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '13px' }}
            >
              <MochiIcon size={31} glow={false} />
              <strong
                style={{
                  background: 'var(--primary-gradient)',
                  fontSize: '21px',
                  fontWeight: 850,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Mochi
              </strong>
              <span style={{ color: '#6d798a', fontSize: '11px', fontWeight: 700 }}>Companion</span>
            </div>
            <p
              style={{
                maxWidth: '255px',
                margin: 0,
                color: '#59677a',
                fontSize: '13px',
                fontWeight: 550,
                lineHeight: 1.65,
              }}
            >
              A calm Windows companion for your tasks, focus, reminders, and important messages.
            </p>
          </div>

          <nav aria-label="Product links">
            <p style={headingStyle}>EXPLORE</p>
            <ul style={listStyle}>
              <li>
                <a href="#your-day" style={linkStyle}>
                  Your day
                </a>
              </li>
              <li>
                <a href="#focus" style={linkStyle}>
                  Focus companion
                </a>
              </li>
              <li>
                <a href="#routine" style={linkStyle}>
                  Gentle routines
                </a>
              </li>
              <li>
                <a href="#privacy" style={linkStyle}>
                  Privacy
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-label="Resources links">
            <p style={headingStyle}>RESOURCES</p>
            <ul style={listStyle}>
              <li>
                <a href="/blog" style={linkStyle}>
                  Blog
                </a>
              </li>
              <li>
                <a href="/Mochi-Setup.exe" download style={linkStyle}>
                  Download for Windows
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/manulaWithanage/mochi-companion/blob/main/LICENSE"
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                >
                  Open-source license
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-label="Community links">
            <p style={headingStyle}>COMMUNITY</p>
            <ul style={listStyle}>
              <li>
                <a
                  href="https://github.com/manulaWithanage/mochi-companion"
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/manulaWithanage/mochi-companion/issues"
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                >
                  Report an issue
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/manulaWithanage/mochi-companion/discussions"
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                >
                  Discussions
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div
          className="site-footer__bottom"
          style={{
            display: 'flex',
            marginTop: '30px',
            paddingTop: '18px',
            borderTop: '1px solid rgba(55, 59, 87, .1)',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#7b8798',
            fontSize: '11px',
            fontWeight: 650,
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span>© 2026 Mochi Companion</span>
          <span>Made for a quieter day on your computer</span>
        </div>
      </div>
    </footer>
  );
};
