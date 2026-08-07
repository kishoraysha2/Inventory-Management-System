// --- NEXUS ERP DESIGN TOKEN FOUNDATION ---
// Centralized design tokens standardizing colors, typography, shadows, radii, spacing, z-index, and accessibility focus states.

export const DESIGN_TOKENS = {
  // --- COLOR PALETTE ---
  colors: {
    // Primary Brand Palette (Royal Blue)
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb', // Core Royal Blue
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
    // Secondary Palette (Indigo)
    secondary: {
      50: '#eep2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5', // Core Secondary Indigo
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
      950: '#1e1b4b',
    },
    // Enterprise Sidebar (Deep Navy)
    sidebar: {
      bg: '#0f172a',        // slate-900
      bgAlt: '#1e293b',     // slate-800
      border: '#334155',    // slate-700
      textMuted: '#94a3b8', // slate-400
      textMain: '#e2e8f0',  // slate-200
      textActive: '#ffffff',
      activeBg: '#2563eb',  // Royal blue active pill
      hoverBg: '#1e293b',   // Hover item background
    },
    // Layout Surfaces
    background: {
      canvas: '#f8fafc',    // Soft Neutral Gray (slate-50)
      surface: '#ffffff',   // Pure White Card
      surfaceSubtle: '#f1f5f9', // slate-100
      header: '#ffffff',
    },
    // Semantic Status Colors
    status: {
      success: {
        bg: '#ecfdf5',
        border: '#a7f3d0',
        text: '#047857',
        solid: '#10b981',
      },
      warning: {
        bg: '#fffbebf',
        border: '#fde68a',
        text: '#b45309',
        solid: '#f59e0b',
      },
      danger: {
        bg: '#fef2f2',
        border: '#fecaca',
        text: '#b91c1c',
        solid: '#ef4444',
      },
      info: {
        bg: '#f0f9ff',
        border: '#bae6fd',
        text: '#0369a1',
        solid: '#0ea5e9',
      },
      // Restricted to charts & analytics
      chartAccent: {
        solid: '#8b5cf6',
        light: '#f5f3ff',
      }
    }
  },

  // --- TYPOGRAPHY HIERARCHY ---
  typography: {
    fontFamily: {
      sans: '"Inter", ui-sans-serif, system-ui, sans-serif',
      mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    },
    hierarchy: {
      display: {
        fontSize: '1.875rem', // 30px
        lineHeight: '2.25rem',
        fontWeight: '800',
        letterSpacing: '-0.025em',
        className: 'text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900',
      },
      pageTitle: {
        fontSize: '1.5rem', // 24px
        lineHeight: '2rem',
        fontWeight: '700',
        letterSpacing: '-0.02em',
        className: 'text-xl sm:text-2xl font-bold tracking-tight text-slate-900',
      },
      sectionTitle: {
        fontSize: '1.125rem', // 18px
        lineHeight: '1.75rem',
        fontWeight: '700',
        letterSpacing: '-0.01em',
        className: 'text-base sm:text-lg font-bold text-slate-800',
      },
      cardTitle: {
        fontSize: '0.875rem', // 14px
        lineHeight: '1.25rem',
        fontWeight: '700',
        letterSpacing: '0em',
        className: 'text-xs sm:text-sm font-bold text-slate-800',
      },
      body: {
        fontSize: '0.875rem', // 14px
        lineHeight: '1.25rem',
        fontWeight: '400',
        className: 'text-xs sm:text-sm text-slate-600',
      },
      caption: {
        fontSize: '0.75rem', // 12px
        lineHeight: '1rem',
        fontWeight: '500',
        className: 'text-xs font-medium text-slate-500',
      },
      metadata: {
        fontSize: '0.625rem', // 10px
        lineHeight: '0.875rem',
        fontWeight: '700',
        letterSpacing: '0.08em',
        className: 'text-[10px] font-bold uppercase tracking-wider text-slate-400',
      }
    }
  },

  // --- SHADOWS ---
  shadows: {
    '3xs': '0 1px 2px 0 rgba(15, 23, 42, 0.03)',
    '2xs': '0 1px 3px 0 rgba(15, 23, 42, 0.05)',
    xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    focusRing: '0 0 0 2px #ffffff, 0 0 0 4px #2563eb',
  },

  // --- BORDER RADIUS ---
  radius: {
    sm: '0.375rem', // 6px
    md: '0.5rem',   // 8px
    lg: '0.75rem',  // 12px
    xl: '1rem',     // 16px
    '2xl': '1.5rem',// 24px
    full: '9999px',
  },

  // --- Z-INDEX LAYERS ---
  zIndex: {
    base: 0,
    content: 10,
    stickyHeader: 20,
    sidebar: 30,
    dropdown: 40,
    overlay: 50,
    modal: 60,
    tooltip: 70,
    toast: 80,
  },

  // --- ANIMATION TIMING ---
  animation: {
    durationFast: '150ms',
    durationNormal: '250ms',
    durationSlow: '350ms',
    easingStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easingDecelerate: 'cubic-bezier(0.0, 0, 0.2, 1)',
    easingAccelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  },

  // --- ICON SIZE STANDARDS ---
  iconSizes: {
    xs: '12px',
    sm: '16px',
    md: '20px',
    lg: '24px',
    xl: '32px',
  }
} as const;

export type DesignTokens = typeof DESIGN_TOKENS;
