export const cnyStyles = `
      .cny-overlay {
        --bg-dark: #0a0a12;
        --bg-gradient: #0d0d1a;
        --gold: #ffd700;
        --text-primary: #f0e6d3;
        --text-muted: #8b7355;
      }

      .cny-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: var(--bg-dark);
        overflow: hidden;
      }

      .cny-stars {
        position: absolute;
        inset: 0;
        z-index: 0;
        background: radial-gradient(ellipse at bottom, #1a1a2e 0%, var(--bg-dark) 100%);
      }

      .cny-star {
        position: absolute;
        background: #fff;
        border-radius: 9999px;
        animation: cny-twinkle var(--duration) ease-in-out infinite;
      }

      .cny-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
      }

      .cny-content {
        position: absolute;
        inset: 0;
        z-index: 10;
        pointer-events: none;
      }

      .cny-greeting {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        animation: cny-float 4s ease-in-out infinite;
      }

      .cny-title {
        margin: 0;
        font-size: clamp(3rem, 10vw, 7rem);
        color: transparent;
        background: linear-gradient(135deg, #ffd700 0%, #ff6b6b 50%, #ffd700 100%);
        background-size: 200% 200%;
        -webkit-background-clip: text;
        background-clip: text;
        text-shadow: 0 0 60px rgba(255, 215, 0, 0.3);
        letter-spacing: 0.1em;
        animation: cny-shimmer 3s ease-in-out infinite;
        font-family: 'KaiTi', 'STKaiti', 'Songti SC', serif;
        font-weight: 700;
      }

      .cny-subtitle {
        margin-top: 0.85rem;
        font-size: clamp(1rem, 3vw, 1.5rem);
        color: var(--text-primary);
        opacity: 0.9;
        letter-spacing: 0.3em;
      }

      .cny-hint {
        position: absolute;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        color: var(--text-muted);
        font-size: 0.9rem;
        text-align: center;
        animation: cny-pulse 2s ease-in-out infinite;
      }

      .cny-counter {
        position: absolute;
        top: 1.2rem;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(20, 20, 35, 0.8);
        border: 1px solid rgba(255, 215, 0, 0.2);
        border-radius: 12px;
        color: var(--gold);
        font-size: 0.85rem;
        padding: 0.75rem 1.25rem;
        backdrop-filter: blur(10px);
        text-align: center;
      }

      .cny-lantern {
        position: absolute;
        z-index: 5;
        transform-origin: 50% 0%;
        animation: cny-sway-left 4.6s ease-in-out infinite;
        pointer-events: none;
        will-change: transform;
      }

      .cny-lantern-left {
        top: 5%;
        left: 5%;
        animation-delay: 0s;
      }

      .cny-lantern-right {
        top: 8%;
        right: 5%;
        animation: cny-sway-right 5.1s ease-in-out infinite;
      }

      .cny-lantern svg {
        width: clamp(40px, 8vw, 80px);
        height: auto;
        filter: drop-shadow(0 0 20px rgba(255, 100, 100, 0.6));
      }

      .cny-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        z-index: 20;
      }

      @keyframes cny-twinkle {
        0%, 100% { opacity: var(--min-opacity); transform: scale(1); }
        50% { opacity: 1; transform: scale(1.2); }
      }

      @keyframes cny-float {
        0%, 100% { transform: translate(-50%, -50%) translateY(0); }
        50% { transform: translate(-50%, -50%) translateY(-15px); }
      }

      @keyframes cny-shimmer {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }

      @keyframes cny-pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }

      @keyframes cny-sway-left {
        0%, 100% { transform: rotate(-10deg) translateY(0); }
        50% { transform: rotate(8deg) translateY(-4px); }
      }

      @keyframes cny-sway-right {
        0%, 100% { transform: rotate(10deg) translateY(0); }
        50% { transform: rotate(-8deg) translateY(-4px); }
      }

      @media (max-width: 640px) {
        .cny-counter {
          top: 0.95rem;
          font-size: 0.75rem;
          padding: 0.6rem 0.85rem;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .cny-star,
        .cny-greeting,
        .cny-hint {
          animation: none !important;
        }

        .cny-title {
          animation: none !important;
          background-position: 0 50%;
        }
      }
    `;
