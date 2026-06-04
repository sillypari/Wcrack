import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        bg: {
          root: "var(--bg-root)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
          hover: "var(--bg-hover)",
          active: "var(--bg-active)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          disabled: "var(--text-disabled)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          glow: "var(--accent-glow)",
          text: "var(--accent-text)",
        },
        status: {
          running: "var(--status-running)",
          success: "var(--status-success)",
          warning: "var(--status-warning)",
          error: "var(--status-error)",
          info: "var(--status-info)",
          idle: "var(--status-idle)",
        },
        rf: {
          'signal-strong': "var(--rf-signal-strong)",
          'signal-good': "var(--rf-signal-good)",
          'signal-weak': "var(--rf-signal-weak)",
          'signal-poor': "var(--rf-signal-poor)",
          'band-24': "var(--rf-band-24)",
          'band-5': "var(--rf-band-5)",
          wpa2: "var(--rf-wpa2)",
          wpa3: "var(--rf-wpa3)",
          wep: "var(--rf-wep)",
          open: "var(--rf-open)",
        },
        ring: "var(--accent)",
        background: "var(--bg-root)",
        foreground: "var(--text-primary)",
        glass: {
          bg: "var(--glass-bg)",
          border: "var(--glass-border)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        md: "var(--text-md)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        '2xl': "var(--text-2xl)",
        '3xl': "var(--text-3xl)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        'glow-accent': "var(--shadow-glow-accent)",
        'glow-green': "var(--shadow-glow-green)",
        'glow-red': "var(--shadow-glow-red)",
        'glow-warning': "var(--shadow-glow-warning)",
        'glow-info': "var(--shadow-glow-info)",
      },
      transitionDuration: {
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        default: "var(--ease-default)",
        spring: "var(--ease-spring)",
        out: "var(--ease-out)",
        in: "var(--ease-in)",
      },
      keyframes: {
        "pulse-green": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(142, 60%, 50%, 0.4)" },
          "50%": { boxShadow: "0 0 0 6px hsl(142, 60%, 50%, 0)" },
        },
        "pulse-orange": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(18, 90%, 56%, 0.3)" },
          "50%": { boxShadow: "0 0 0 6px hsl(18, 90%, 56%, 0)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-3px)" },
          "40%": { transform: "translateX(3px)" },
          "60%": { transform: "translateX(-2px)" },
          "80%": { transform: "translateX(2px)" },
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "pulse-green": "pulse-green 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-orange": "pulse-orange 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fade-in var(--duration-normal) var(--ease-default)",
        "slide-in-right": "slide-in-right var(--duration-normal) var(--ease-default)",
        "shake": "shake var(--duration-fast) var(--ease-default)",
        "count-up": "count-up var(--duration-normal) var(--ease-default)",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require("tailwindcss-animate")],
}

export default config
