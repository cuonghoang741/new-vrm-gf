import React, { createContext, useContext, PropsWithChildren } from 'react';

// ─── Theme tokens ─────────────────────────────────────────
const darkColors = {
    background: {
        brand_solid: '#8B5CF6',
        brand_primary_alt: '#1E1E2E',
        error_solid: '#EF4444',
        success_solid: '#22C55E',
        warning_solid: '#F59E0B',
    },
    text: {
        primary_on_brand: '#FFFFFF',
        brand_secondary: '#C4B5FD',
        gray_primary: '#E5E5E5',
        error_primary: '#FCA5A5',
        success_primary: '#86EFAC',
        warning_primary: '#FDE68A',
    },
    border: {
        primary: 'rgba(255,255,255,0.12)',
        brand_alt: '#7C3AED',
        border_error: '#DC2626',
        border_success: '#16A34A',
        border_warning: '#D97706',
    },
};

const typography = {
    text: {
        xs: { fontSize: 12 },
        sm: { fontSize: 14 },
        md: { fontSize: 16 },
        lg: { fontSize: 18 },
        xl: { fontSize: 20 },
    },
};

const radius = {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 20,
    '3xl': 24,
    full: 9999,
};

const spacing = (n: number) => n * 4;

const theme = {
    colors: darkColors,
    typography,
    radius,
    spacing,
};

export type Theme = typeof theme;

const ThemeContext = createContext<Theme>(theme);

export function ThemeProvider({ children }: PropsWithChildren) {
    return (
        <ThemeContext.Provider value={theme}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): Theme {
    return useContext(ThemeContext);
}
