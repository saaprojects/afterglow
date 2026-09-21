import {Application, Container, Graphics, Sprite, Texture} from 'pixi.js';
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

// Scene draws a drawlist.Instance[] onto a PixiJS canvas. It is the single
// place that turns instances into pixels, so preview (driven by a ticker)
// and export (stepped frame-by-frame) are guaranteed to render identically
// for the same instance list.
export class Scene {
    readonly app: Application;
    private readonly pool: Sprite[] = [];
    private readonly noteContainer: Container;
    private readonly keyHighlights: Map<number, Sprite>;
    private readonly keyLastActiveT = new Map<number, number>();
    private readonly keyLastTint = new Map<number, number>();
    private readonly hitLineY: number;

    private constructor(app: Application, noteContainer: Container, keyHighlights: Map<number, Sprite>, hitLineY: number) {
        this.app = app;
        this.noteContainer = noteContainer;
        this.keyHighlights = keyHighlights;
        this.hitLineY = hitLineY;
    }

    static async create(size: SceneSize, host?: HTMLElement | null): Promise<Scene> {
        const app = new Application();
        await app.init({
            width: size.width,
            height: size.height,
            background: '#101018',
            antialias: false,
        });
        host?.appendChild(app.canvas);

        const hitLineY = size.height * HIT_LINE_FRACTION;
        const stripHeight = size.height - hitLineY;

        // Black keys legitimately overlap the outer edges of their two
        // neighboring white keys (real piano key shapes), so white and
        // black layers must each be drawn as a whole, in that order, with
        // each one's highlights immediately after it — otherwise a lit
        // white key would paint over the black keys beside it.
        const whiteBase = new Graphics();
        const whiteHighlights = new Container();
        const blackBase = new Graphics();
        const blackHighlights = new Container();
        const keyHighlights = new Map<number, Sprite>();

        for (const key of size.keyboard) {
            if (key.Black) continue;
            const w = Math.max(key.W - 1, 1);
            whiteBase.rect(key.X, hitLineY, w, stripHeight).fill(0xd8d8d8);

            const s = new Sprite(Texture.WHITE);
            s.visible = false;
            s.x = key.X;
            s.y = hitLineY;
            s.width = w;
            s.height = stripHeight;
            whiteHighlights.addChild(s);
            keyHighlights.set(key.Pitch, s);
        }
        for (const key of size.keyboard) {
            if (!key.Black) continue;
            const h = stripHeight * BLACK_KEY_HEIGHT_FRACTION;
            blackBase.rect(key.X, hitLineY, key.W, h).fill(0x1a1a1a);

            const s = new Sprite(Texture.WHITE);
            s.visible = false;
            s.x = key.X;
            s.y = hitLineY;
            s.width = key.W;
            s.height = h;
            blackHighlights.addChild(s);
            keyHighlights.set(key.Pitch, s);
        }

        app.stage.addChild(whiteBase, whiteHighlights, blackBase, blackHighlights);

        const hitLine = new Graphics()
            .rect(0, hitLineY, size.width, 2)
            .fill(0x666666);
        app.stage.addChild(hitLine);

        const noteContainer = new Container();
        app.stage.addChild(noteContainer);

        return new Scene(app, noteContainer, keyHighlights, hitLineY);
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

        // Key highlights: full brightness while a note is active, fading
        // out afterward as a function of t so the fade is deterministic
        // and identical between live preview and export.
        for (const [pitch, highlight] of this.keyHighlights) {
            const lastActiveT = this.keyLastActiveT.get(pitch);
            if (lastActiveT === undefined) {
                highlight.visible = false;
                continue;
            }
            const age = Math.max(t - lastActiveT, 0);
            const alpha = 1 - Math.min(age / KEY_FADE_SECONDS, 1);
            highlight.visible = alpha > 0;
            if (alpha > 0) {
                highlight.alpha = alpha;
                highlight.tint = this.keyLastTint.get(pitch)!;
            }
        }
    }

    /**
     * Resets key-fade tracking. Call this whenever time stops advancing or
     * jumps discontinuously (pause, auto-stop at the end, scrubbing) —
     * otherwise a key that was active at the moment time froze would stay
     * lit forever, since the fade only progresses as t advances past it.
     * The next update() call re-derives each key's correct state from
     * whatever's actually active at the current t.
     */
    clearKeyHighlights() {
        this.keyLastActiveT.clear();
        this.keyLastTint.clear();
        for (const highlight of this.keyHighlights.values()) {
            highlight.visible = false;
        }
    }

    /** Renders the current sprite state to the canvas immediately. */
    renderFrame() {
        this.app.renderer.render(this.app.stage);
    }

    destroy() {
        this.app.destroy(true, {children: true});
    }

    private ensurePoolSize(n: number) {
        while (this.pool.length < n) {
            const s = new Sprite(Texture.WHITE);
            s.visible = false;
            this.noteContainer.addChild(s);
            this.pool.push(s);
        }
    }
}

function hexToTint(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}
