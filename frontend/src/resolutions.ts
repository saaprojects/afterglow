// Common YouTube video sizes, shared between the New Project dialog
// (default project resolution) and the export flow (per-export override).
export interface Resolution {
    label: string;
    width: number;
    height: number;
}

export const RESOLUTIONS: Resolution[] = [
    {label: '1920 × 1080 (1080p)', width: 1920, height: 1080},
    {label: '1280 × 720 (720p)', width: 1280, height: 720},
    {label: '2560 × 1440 (1440p)', width: 2560, height: 1440},
    {label: '3840 × 2160 (4K)', width: 3840, height: 2160},
    {label: '1080 × 1920 (Shorts, vertical)', width: 1080, height: 1920},
];
