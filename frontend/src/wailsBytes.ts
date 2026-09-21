// Wails' generated .d.ts types a Go []byte return value as Array<number>,
// but at runtime it's actually delivered as a base64 string (matching
// encoding/json's standard []byte handling) — unlike a []byte *parameter*,
// which genuinely is a plain number array. Handle both shapes so we're
// correct regardless of which one Wails actually hands back.
export function decodeWailsBytes(data: number[] | string): Uint8Array<ArrayBuffer> {
    if (typeof data === 'string') {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
    return new Uint8Array(data);
}
