import {Application, Container, Graphics, NineSliceSprite, Rectangle, Sprite, Texture} from 'pixi.js';
import {AdvancedBloomFilter} from 'pixi-filters';
import {drawlist} from '../wailsjs/go/models';

// Must match core/drawlist.HitLineFraction.
export const HIT_LINE_FRACTION = 0.85;

export interface SceneSize {
    width: number;
    height: number;
    keyboard: drawlist.KeyRect[];
}

// Black keys are drawn shorter than white keys, as on a real piano —
// this fraction of the strip's height, starting from the hit line.
const BLACK_KEY_HEIGHT_FRACTION = 0.6;

// How long a key highlight takes to fade out after its note releases, in
// project-time seconds (not wall-clock/frame count), so the fade is a pure
// function of t and renders identically in live preview and export.
export const KEY_FADE_SECONDS = 0.2;

const WHITE_KEY_TINT = 0xb8b8b8;
const WHITE_KEY_PRESSED_TINT = 0x8a8a8a; // darker: mimics a key's own shadow when pushed down
const BLACK_KEY_TINT = 0x1a1a1a;
const BLACK_KEY_PRESSED_TINT = 0x4a4a4a; // lighter: same idea, inverted for a dark key

// Colored strip at the hit-line edge of a pressed key, in the note's track
// color — a color accent without recoloring the whole key.
const ACCENT_HEIGHT_FRACTION = 0.08; // fraction of the white-key strip height

// Falling notes are rounded "pill" rectangles rather than sharp-cornered
// boxes. This is a fixed pixel radius (not proportional to note size), so
// it stays consistent across notes of any width/height, the same way a
// real rounded-corner UI element would.
const NOTE_CORNER_RADIUS = 5;

interface KeyVisual {
    shade: Graphics; // neutral "pressed" darkening/lightening
    accent: Sprite; // thin track-colored strip at the hit-line edge
}

// Draws a rect with sharp top corners and rounded bottom corners (in
// local coordinates, at the given Graphics' current transform) — flat
// where a key meets the hit line, rounded at its outer/front edge like a
// real piano key. Returns g for chaining a .fill() call.
function bottomRoundedRect(g: Graphics, x: number, y: number, w: number, h: number, r: number): Graphics {
    return g
        .moveTo(x, y)
        .lineTo(x + w, y)
        .arcTo(x + w, y + h, x, y + h, r)
        .arcTo(x, y + h, x, y, r)
        .lineTo(x, y);
}

// Scene draws a drawlist.Instance[] onto a PixiJS canvas. It is the single
// place that turns instances into pixels, so preview (driven by a ticker)
// and export (stepped frame-by-frame) are guaranteed to render identically
// for the same instance list.
export class Scene {
    readonly app: Application;
    private readonly pool: NineSliceSprite[] = [];
    private readonly noteContainer: Container;
    private readonly noteTexture: Texture;
    private readonly keyVisuals: Map<number, KeyVisual>;
    private readonly keyLastActiveT = new Map<number, number>();
    private readonly keyLastTint = new Map<number, number>();
    private readonly hitLineY: number;

    private constructor(
        app: Application,
        noteContainer: Container,
        noteTexture: Texture,
        keyVisuals: Map<number, KeyVisual>,
        hitLineY: number,
    ) {
        this.app = app;
        this.noteContainer = noteContainer;
        this.noteTexture = noteTexture;
        this.keyVisuals = keyVisuals;
        this.hitLineY = hitLineY;
    }

    static async create(size: SceneSize, host?: HTMLElement | null): Promise<Scene> {
        const app = new Application();
        await app.init({
            width: size.width,
            height: size.height,
            background: '#101018',
            antialias: false,
            // Rendering is driven entirely by explicit renderFrame() calls
            // (from Preview's async per-tick update, or export's frame
            // loop). Without this, PixiJS's own automatic per-tick render
            // races against those explicit calls — with a multi-pass
            // filter like bloom in between, that race caused the glow to
            // intermittently glitch/disappear on some frames.
            autoStart: false,
        });
        app.ticker.start(); // still drive Preview's own per-tick callback
        host?.appendChild(app.canvas);

        // A small rounded-rect texture, nine-sliced per note so the corner
        // radius stays fixed regardless of how wide/tall a given note is.
        const noteShape = new Graphics()
            .roundRect(0, 0, NOTE_CORNER_RADIUS * 2 + 2, NOTE_CORNER_RADIUS * 2 + 2, NOTE_CORNER_RADIUS)
            .fill(0xffffff);
        const noteTexture = app.renderer.generateTexture({target: noteShape, antialias: true});
        noteShape.destroy();

        const hitLineY = size.height * HIT_LINE_FRACTION;
        const stripHeight = size.height - hitLineY;
        const accentHeight = stripHeight * ACCENT_HEIGHT_FRACTION;

        // Black keys legitimately overlap the outer edges of their two
        // neighboring white keys (real piano key shapes), so white and
        // black layers must each be drawn as a whole, in that order, with
        // each one's highlights immediately after it — otherwise a lit
        // white key would paint over the black keys beside it.
        const whiteBase = new Graphics();
        const whiteShadeLayer = new Container();
        const whiteAccentLayer = new Container();
        const blackBase = new Graphics();
        const blackShadeLayer = new Container();
        const blackAccentLayer = new Container();
        const keyVisuals = new Map<number, KeyVisual>();

        function makeVisual(
            key: drawlist.KeyRect,
            w: number,
            h: number,
            pressedTint: number,
            shadeLayer: Container,
            accentLayer: Container,
        ): KeyVisual {
            const shade = bottomRoundedRect(new Graphics(), 0, 0, w, h, NOTE_CORNER_RADIUS).fill(pressedTint);
            shade.visible = false;
            shade.x = key.X;
            shade.y = hitLineY;
            shadeLayer.addChild(shade);

            const accent = new Sprite(Texture.WHITE);
            accent.visible = false;
            accent.x = key.X;
            accent.y = hitLineY;
            accent.width = w;
            accent.height = Math.min(accentHeight, h);
            accentLayer.addChild(accent);

            return {shade, accent};
        }

        for (const key of size.keyboard) {
            if (key.Black) continue;
            const w = Math.max(key.W - 1, 1);
            bottomRoundedRect(whiteBase, key.X, hitLineY, w, stripHeight, NOTE_CORNER_RADIUS).fill(WHITE_KEY_TINT);
            keyVisuals.set(
                key.Pitch,
                makeVisual(key, w, stripHeight, WHITE_KEY_PRESSED_TINT, whiteShadeLayer, whiteAccentLayer),
            );
        }
        for (const key of size.keyboard) {
            if (!key.Black) continue;
            const h = stripHeight * BLACK_KEY_HEIGHT_FRACTION;
            bottomRoundedRect(blackBase, key.X, hitLineY, key.W, h, NOTE_CORNER_RADIUS).fill(BLACK_KEY_TINT);
            keyVisuals.set(
                key.Pitch,
                makeVisual(key, key.W, h, BLACK_KEY_PRESSED_TINT, blackShadeLayer, blackAccentLayer),
            );
        }

        // No filters on the key shade/accent layers — glow there was a
        // persistent source of flicker even after isolating it from the
        // keyboard and pinning filterArea. Keys just show flat shade +
        // accent color; falling notes still glow via noteContainer below.
        app.stage.addChild(whiteBase, whiteShadeLayer, whiteAccentLayer, blackBase, blackShadeLayer, blackAccentLayer);

        const hitLine = new Graphics()
            .rect(0, hitLineY, size.width, 2)
            .fill(0x666666);
        app.stage.addChild(hitLine);

        const noteContainer = new Container();
        // Applied only to the note layer, isolated from the keyboard
        // entirely — track colors (e.g. green) can have lower luminance
        // than the plain white keys, so a single scene-wide threshold can't
        // exclude the keyboard without also excluding the notes. Keeping
        // bloom scoped to notes-only means threshold only has to account
        // for note colors, and the keyboard is never a factor.
        noteContainer.filters = [
            new AdvancedBloomFilter({threshold: 0.3, bloomScale: 1.2, brightness: 1.0, blur: 6, quality: 4}),
        ];
        // Fixed instead of PixiJS's auto-computed bounds, which shift as
        // notes appear/disappear — a moving target for a multi-pass filter.
        noteContainer.filterArea = new Rectangle(0, 0, size.width, hitLineY);
        app.stage.addChild(noteContainer);

        return new Scene(app, noteContainer, noteTexture, keyVisuals, hitLineY);
    }

    /**
     * Updates sprites to match instances at project time t. Does not
     * render/present a frame.
     */
    update(instances: drawlist.Instance[], t: number) {
        this.ensurePoolSize(instances.length);
        instances.forEach((inst, i) => {
            const s = this.pool[i];
            const tint = hexToTint(inst.Color);

            // A note is actively sounding exactly when its (unclipped)
            // rectangle straddles the hit line.
            if (inst.Y <= this.hitLineY && inst.Y + inst.H >= this.hitLineY) {
                this.keyLastActiveT.set(inst.Pitch, t);
                this.keyLastTint.set(inst.Pitch, tint);
            }

            const clippedHeight = Math.max(Math.min(inst.Y + inst.H, this.hitLineY) - inst.Y, 0);
            if (clippedHeight <= 0) {
                s.visible = false;
                return;
            }

            s.visible = true;
            s.x = inst.X;
            s.y = inst.Y;
            s.width = Math.max(inst.W - 1, 1); // hairline gap between keys
            s.height = clippedHeight;
            s.tint = tint;
            s.alpha = 0.55 + 0.45 * inst.Glow;
        });
        for (let i = instances.length; i < this.pool.length; i++) {
            this.pool[i].visible = false;
        }

        // Key press visuals: full brightness while a note is active, fading
        // out afterward as a function of t so the fade is deterministic and
        // identical between live preview and export. The shade (neutral
        // pressed-key look) and accent (track-colored strip) fade together.
        for (const [pitch, visual] of this.keyVisuals) {
            const lastActiveT = this.keyLastActiveT.get(pitch);
            if (lastActiveT === undefined) {
                visual.shade.visible = false;
                visual.accent.visible = false;
                continue;
            }
            const age = Math.max(t - lastActiveT, 0);
            const alpha = 1 - Math.min(age / KEY_FADE_SECONDS, 1);
            const visible = alpha > 0;
            visual.shade.visible = visible;
            visual.accent.visible = visible;
            if (visible) {
                visual.shade.alpha = alpha;
                visual.accent.alpha = alpha;
                visual.accent.tint = this.keyLastTint.get(pitch)!;
            }
        }
    }

    /**
     * Resets key-press-visual fade tracking. Call this whenever time stops
     * advancing or jumps discontinuously (pause, auto-stop at the end,
     * scrubbing) — otherwise a key that was active at the moment time froze
     * would stay lit forever, since the fade only progresses as t advances
     * past it. The next update() call re-derives each key's correct state
     * from whatever's actually active at the current t.
     */
    clearKeyHighlights() {
        this.keyLastActiveT.clear();
        this.keyLastTint.clear();
        for (const visual of this.keyVisuals.values()) {
            visual.shade.visible = false;
            visual.accent.visible = false;
        }
    }

    /** Renders the current sprite state to the canvas immediately. */
    renderFrame() {
        this.app.renderer.render(this.app.stage);
    }

    destroy() {
        this.app.destroy(true, {children: true});
        this.noteTexture.destroy(true);
    }

    private ensurePoolSize(n: number) {
        while (this.pool.length < n) {
            const s = new NineSliceSprite({
                texture: this.noteTexture,
                leftWidth: NOTE_CORNER_RADIUS,
                rightWidth: NOTE_CORNER_RADIUS,
                topHeight: NOTE_CORNER_RADIUS,
                bottomHeight: NOTE_CORNER_RADIUS,
                width: 1,
                height: 1,
            });
            s.visible = false;
            this.noteContainer.addChild(s);
            this.pool.push(s);
        }
    }
}

function hexToTint(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}
