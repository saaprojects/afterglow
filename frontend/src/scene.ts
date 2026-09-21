import {Application, BlurFilter, Container, Graphics, NineSliceSprite, Rectangle, Sprite, Texture} from 'pixi.js';
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

// Each note is a translucent "glass" fill in its own track color, with a
// crisp, brighter border (in the glow color — visually and thematically
// the border is the "energetic" edge the glow radiates from).
const NOTE_FILL_ALPHA = 0.45; // glassy: background shows through
const BORDER_WIDTH = 2; // px, in the small shared border texture

// The glow is a separate, larger, blurred copy of just the note's BORDER
// RING (not the filled shape) — blurring a ring concentrates light near
// the edges rather than spreading evenly from the whole area, since the
// ring's own source pixels are already only at the edges. Independently
// colored, not bloom-extracted brightness (bloom can't be given an
// explicit output color — it just amplifies whatever's already there).
const GLOW_PADDING = 10; // px each side, how much bigger the glow is than the note
const GLOW_BLUR_STRENGTH = 12;
const GLOW_ALPHA = 1.0;

// Sparks and smoke are both deterministic, continuously-emitting streams:
// a pure function of t (via a repeating spawn cycle + a hash-based
// pseudo-random seed per cycle index), not per-frame randomness or
// accumulated particle state. That's required, not just a style choice —
// export steps through frames independently of preview's wall-clock
// ticking, so anything driven by Math.random() per frame or by
// state carried over from the previous frame would render differently
// between the two (or differently if preview ever re-renders the same t).
function hash(seed: number): number {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

// Must match core/drawlist.LookaheadSeconds — used to derive scrollSpeed
// from geometry (hitLineY / LOOKAHEAD_SECONDS) so the impact burst below
// can compute "time since this note started sounding" purely from an
// instance's Y/H, with no cross-frame state of its own.
const LOOKAHEAD_SECONDS = 3.0;

// Small bright embers continuously emitted from each currently-active key.
const SPARK_INTERVAL = 0.035; // seconds between spawns, per key
const SPARK_LIFETIME = 0.65; // seconds a spark stays alive
const SPARK_CYCLES = Math.ceil(SPARK_LIFETIME / SPARK_INTERVAL) + 1;
const SPARK_RISE = 160; // px risen over its lifetime
// Horizontal path is a curl, not a straight drift: each spark arcs out to
// one side and wraps back in toward lane-center as it nears the top of its
// rise (sin(0..π) — zero at both ends, peaking at the midpoint), rather
// than wandering off toward neighboring lanes.
const SPARK_CURL = 22; // px max distance from lane center at the curl's peak
const SPARK_SIZE = 8;
// Keep spawning trickle sparks a little past note release rather than
// cutting off the instant it ends — embers don't vanish the moment a key
// comes up.
const SPARK_LINGER = 0.15;

// A one-time radial burst of extra sparks at the instant a note starts
// sounding — the continuous stream above reads as a steady trickle, this
// is the "impact" moment. Triggered by age-since-onset (derived from
// geometry, see keyOnsetT below), not a spawn cycle, since it only ever
// fires once per note.
const IMPACT_BURST_LIFETIME = 0.45; // seconds the burst's sparks stay alive
const IMPACT_BURST_COUNT = 16;
const IMPACT_BURST_SPREAD = 55; // px max horizontal distance at full life
const IMPACT_BURST_RISE = 50; // px risen at full life
const IMPACT_BURST_SIZE = 12;

// A bright white flash at the exact instant of impact — separate from the
// colored embers, this is the "hit" cue itself: expands and fades fast.
const FLASH_LIFETIME = 0.15;
const FLASH_SIZE = 100;

// A subtle, ambient haze rising along the whole hit line, independent of
// which notes are playing — deliberately low alpha, this is atmosphere,
// not a focal effect. Puff count is derived from width (see smokePuffCount
// below), spaced closely enough that puffs overlap and read as a
// continuous haze along the full line rather than isolated dots.
const SMOKE_PUFF_SPACING = 30; // px between ambient puff spawn positions
const SMOKE_INTERVAL = 0.7; // seconds between spawns, per position
const SMOKE_LIFETIME = 2.6; // seconds a puff stays alive
const SMOKE_CYCLES = Math.ceil(SMOKE_LIFETIME / SMOKE_INTERVAL) + 1;
const SMOKE_RISE = 70; // px risen over its lifetime
const SMOKE_DRIFT = 15; // px/sec max horizontal drift
const SMOKE_SIZE = 34; // px base diameter — bigger, so neighbors overlap
const SMOKE_ALPHA = 0.28;
const SMOKE_BLUR_STRENGTH = 6; // merges overlapping puffs into one haze

// The hit line itself: a thin, bright bar per key, always visible, that
// takes on that key's glow color (and gets a soft blurred bloom to match)
// while a note is sounding there — rather than one flat gray bar across
// the whole width, unrelated to what's actually playing.
const HIT_LINE_HEIGHT = 4; // idle thickness, px
const HIT_LINE_ACTIVE_HEIGHT = 7; // thickness while lit, px
const HIT_LINE_IDLE_TINT = 0x999999;
const HIT_LINE_GLOW_HEIGHT = 22; // px, the blurred bloom band's thickness
const HIT_LINE_GLOW_PADDING = 12; // px each side, wider than the key itself

// A light wisp of smoke shrouding each active note's sparks specifically
// (as opposed to the ambient haze above, which ignores note activity
// entirely) — lingers a bit after the note releases, same as the sparks.
const NOTE_SMOKE_INTERVAL = 0.15;
const NOTE_SMOKE_LIFETIME = 1.4;
const NOTE_SMOKE_CYCLES = Math.ceil(NOTE_SMOKE_LIFETIME / NOTE_SMOKE_INTERVAL) + 1;
const NOTE_SMOKE_LINGER = 0.5; // seconds after note release to keep it drifting
const NOTE_SMOKE_RISE = 65;
const NOTE_SMOKE_DRIFT = 18;
const NOTE_SMOKE_SIZE = 30;
const NOTE_SMOKE_ALPHA = 0.22;

interface KeyVisual {
    shade: Graphics; // neutral "pressed" darkening/lightening
    accent: Sprite; // thin track-colored strip at the hit-line edge
    hitBar: Sprite; // this key's segment of the hit line itself
    hitGlow: Sprite; // blurred bloom band behind hitBar, lit only while active
}

// Linearly interpolates between two 0xRRGGBB colors.
function lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
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
    private readonly fillPool: NineSliceSprite[] = [];
    private readonly borderPool: NineSliceSprite[] = [];
    private readonly glowPool: NineSliceSprite[] = [];
    private readonly sparkPool: Sprite[] = [];
    private readonly smokePool: Sprite[] = [];
    private readonly noteSmokePool: Sprite[] = [];
    private readonly noteContainer: Container;
    private readonly glowContainer: Container;
    private readonly sparkContainer: Container;
    private readonly smokeContainer: Container;
    private readonly noteSmokeContainer: Container;
    private readonly fillTexture: Texture;
    private readonly borderTexture: Texture;
    private readonly smokeTexture: Texture;
    private readonly sparkTexture: Texture;
    private readonly keyVisuals: Map<number, KeyVisual>;
    private readonly keyLastActiveT = new Map<number, number>();
    private readonly keyLastTint = new Map<number, number>();
    private readonly keyLastGlowTint = new Map<number, number>();
    // Time (project seconds) each pitch's currently-sounding note started —
    // recomputed every active frame from instance geometry, not carried
    // state, so it's automatically correct even if preview seeks/scrubs.
    private readonly keyOnsetT = new Map<number, number>();
    private readonly hitLineY: number;
    private readonly width: number;
    private readonly scrollSpeed: number;
    private readonly smokePuffCount: number;

    private constructor(
        app: Application,
        noteContainer: Container,
        glowContainer: Container,
        sparkContainer: Container,
        smokeContainer: Container,
        noteSmokeContainer: Container,
        fillTexture: Texture,
        borderTexture: Texture,
        smokeTexture: Texture,
        sparkTexture: Texture,
        keyVisuals: Map<number, KeyVisual>,
        hitLineY: number,
        width: number,
    ) {
        this.app = app;
        this.noteContainer = noteContainer;
        this.glowContainer = glowContainer;
        this.sparkContainer = sparkContainer;
        this.smokeContainer = smokeContainer;
        this.noteSmokeContainer = noteSmokeContainer;
        this.fillTexture = fillTexture;
        this.borderTexture = borderTexture;
        this.smokeTexture = smokeTexture;
        this.sparkTexture = sparkTexture;
        this.keyVisuals = keyVisuals;
        this.hitLineY = hitLineY;
        this.width = width;
        this.scrollSpeed = hitLineY / LOOKAHEAD_SECONDS;
        this.smokePuffCount = Math.max(1, Math.round(width / SMOKE_PUFF_SPACING));
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
            // filter like blur in between, that race caused the glow to
            // intermittently glitch/disappear on some frames.
            autoStart: false,
        });
        app.ticker.start(); // still drive Preview's own per-tick callback
        host?.appendChild(app.canvas);

        // A small rounded-rect texture, nine-sliced per note (and its glow)
        // so the corner radius stays fixed regardless of how wide/tall a
        // given note is.
        const texSize = NOTE_CORNER_RADIUS * 2 + 2;
        const fillShape = new Graphics().roundRect(0, 0, texSize, texSize, NOTE_CORNER_RADIUS).fill(0xffffff);
        const fillTexture = app.renderer.generateTexture({target: fillShape, antialias: true});
        fillShape.destroy();

        // Ring only (no fill), inset by half the stroke width so the
        // stroke itself stays fully inside the texture bounds.
        const borderShape = new Graphics()
            .roundRect(
                BORDER_WIDTH / 2,
                BORDER_WIDTH / 2,
                texSize - BORDER_WIDTH,
                texSize - BORDER_WIDTH,
                NOTE_CORNER_RADIUS,
            )
            .stroke({width: BORDER_WIDTH, color: 0xffffff});
        const borderTexture = app.renderer.generateTexture({
            target: borderShape,
            antialias: true,
            frame: new Rectangle(0, 0, texSize, texSize),
        });
        borderShape.destroy();

        // Soft radial falloff baked directly into the texture (layered
        // circles, outer-to-inner, each fainter than the last) rather than
        // a hard-edged circle plus a post-process blur. Blurring a small,
        // isolated, hard-edged shape is a known weak spot for cheap
        // (Kawase-style) blur approximations — the few directional sample
        // offsets they use can show up as visible cross/plus artifacts on
        // sparse point-like sources, which is exactly this case.
        const smokeTexSize = 64;
        const smokeCenter = smokeTexSize / 2;
        const smokeShape = new Graphics();
        const SMOKE_TEXTURE_RINGS = 8;
        for (let ring = SMOKE_TEXTURE_RINGS; ring >= 1; ring--) {
            const r = (ring / SMOKE_TEXTURE_RINGS) * smokeCenter;
            const alpha = (1 - ring / SMOKE_TEXTURE_RINGS) * 0.5;
            smokeShape.circle(smokeCenter, smokeCenter, r).fill({color: 0xffffff, alpha});
        }
        const smokeTexture = app.renderer.generateTexture({
            target: smokeShape,
            antialias: true,
            frame: new Rectangle(0, 0, smokeTexSize, smokeTexSize),
        });
        smokeShape.destroy();

        // Soft glowing dot for sparks/flash — a bright core with a quick
        // radial falloff, same layered-circle technique as the smoke
        // texture above. Used instead of a flat Texture.WHITE square so
        // additive blending actually reads as a glow rather than a hard
        // colored square stacking on itself.
        const sparkTexSize = 32;
        const sparkCenter = sparkTexSize / 2;
        const sparkShape = new Graphics();
        const SPARK_TEXTURE_RINGS = 6;
        for (let ring = SPARK_TEXTURE_RINGS; ring >= 1; ring--) {
            const r = (ring / SPARK_TEXTURE_RINGS) * sparkCenter;
            const alpha = ring === 1 ? 1 : (1 - ring / SPARK_TEXTURE_RINGS) * 0.85;
            sparkShape.circle(sparkCenter, sparkCenter, r).fill({color: 0xffffff, alpha});
        }
        const sparkTexture = app.renderer.generateTexture({
            target: sparkShape,
            antialias: true,
            frame: new Rectangle(0, 0, sparkTexSize, sparkTexSize),
        });
        sparkShape.destroy();

        const hitLineY = size.height * HIT_LINE_FRACTION;
        const stripHeight = size.height - hitLineY;
        const accentHeight = stripHeight * ACCENT_HEIGHT_FRACTION;

        // Declared here (rather than where they're added to the stage,
        // below) because makeVisual needs to add each key's hit-line
        // segment/bloom into them. Container creation order doesn't affect
        // render order — only the app.stage.addChild() call order below
        // does — so this is safe.
        const hitLineContainer = new Container();
        const glowContainer = new Container();
        glowContainer.filters = [new BlurFilter({strength: GLOW_BLUR_STRENGTH, quality: 4})];
        glowContainer.filterArea = new Rectangle(
            -GLOW_PADDING,
            -GLOW_PADDING,
            size.width + GLOW_PADDING * 2,
            hitLineY + GLOW_PADDING,
        );

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

            const hitBar = new Sprite(Texture.WHITE);
            hitBar.x = key.X;
            hitBar.y = hitLineY - HIT_LINE_HEIGHT / 2;
            hitBar.width = w;
            hitBar.height = HIT_LINE_HEIGHT;
            hitBar.tint = HIT_LINE_IDLE_TINT;
            hitLineContainer.addChild(hitBar);

            const hitGlow = new Sprite(Texture.WHITE);
            hitGlow.visible = false;
            hitGlow.x = key.X - HIT_LINE_GLOW_PADDING;
            hitGlow.y = hitLineY - HIT_LINE_GLOW_HEIGHT / 2;
            hitGlow.width = w + HIT_LINE_GLOW_PADDING * 2;
            hitGlow.height = HIT_LINE_GLOW_HEIGHT;
            glowContainer.addChild(hitGlow);

            return {shade, accent, hitBar, hitGlow};
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
        // accent color; falling notes still glow via glowContainer below.
        app.stage.addChild(whiteBase, whiteShadeLayer, whiteAccentLayer, blackBase, blackShadeLayer, blackAccentLayer);

        app.stage.addChild(hitLineContainer);

        // Ambient smoke: behind the notes/glow/sparks, rising from the hit
        // line. Its own (lighter) blur, separate from the note glow's —
        // different softness needs, and a fixed filterArea for the same
        // reason as everything else here (auto-computed bounds that shift
        // as puffs spawn/die render a multi-pass filter inconsistently).
        const smokeContainer = new Container();
        smokeContainer.filters = [new BlurFilter({strength: SMOKE_BLUR_STRENGTH, quality: 3})];
        smokeContainer.filterArea = new Rectangle(
            0,
            hitLineY - SMOKE_RISE - SMOKE_SIZE,
            size.width,
            SMOKE_RISE + SMOKE_SIZE * 2,
        );
        app.stage.addChild(smokeContainer);

        // glowContainer (created above, alongside hitLineContainer, so
        // makeVisual could add each key's hitGlow into it) renders behind
        // noteContainer: a larger, blurred, independently-colored copy of
        // each note's BORDER RING (not its fill) — see GLOW_PADDING's
        // comment — plus each active key's hit-line bloom band. Isolated
        // in its own container (not sharing bounds with the keyboard) with
        // a fixed filterArea, for the same reasons as the old bloom setup
        // — an auto-computed, constantly-shifting bounds region made a
        // multi-pass filter render inconsistently frame to frame.
        app.stage.addChild(glowContainer);

        const noteContainer = new Container();
        app.stage.addChild(noteContainer);

        // Per-note smoke wisps: rendered above the notes (shrouding the
        // sparks that sit on top of it) but below the sparks themselves,
        // so embers still read as crisp bright points poking through haze
        // rather than getting buried in it. Own light blur on top of the
        // already-soft texture, fixed filterArea across the full width
        // since wisps can appear at any active key's X position.
        const noteSmokeContainer = new Container();
        noteSmokeContainer.filters = [new BlurFilter({strength: 3, quality: 3})];
        noteSmokeContainer.filterArea = new Rectangle(
            0,
            hitLineY - NOTE_SMOKE_RISE - NOTE_SMOKE_SIZE,
            size.width,
            NOTE_SMOKE_RISE + NOTE_SMOKE_SIZE * 2,
        );
        app.stage.addChild(noteSmokeContainer);

        // Sparks render last/on top — crisp bright embers over everything.
        // Additive blending: overlapping sparks brighten instead of
        // occluding, which reads as "hot" rather than as flat colored dots.
        const sparkContainer = new Container();
        sparkContainer.blendMode = 'add';
        app.stage.addChild(sparkContainer);

        return new Scene(
            app,
            noteContainer,
            glowContainer,
            sparkContainer,
            smokeContainer,
            noteSmokeContainer,
            fillTexture,
            borderTexture,
            smokeTexture,
            sparkTexture,
            keyVisuals,
            hitLineY,
            size.width,
        );
    }

    /**
     * Updates sprites to match instances at project time t. Does not
     * render/present a frame.
     */
    update(instances: drawlist.Instance[], t: number) {
        this.ensurePoolSize(instances.length);
        instances.forEach((inst, i) => {
            const fill = this.fillPool[i];
            const border = this.borderPool[i];
            const glow = this.glowPool[i];
            const tint = hexToTint(inst.Color);
            const borderTint = hexToTint(inst.GlowColor || inst.Color);

            // A note is actively sounding exactly when its (unclipped)
            // rectangle straddles the hit line.
            if (inst.Y <= this.hitLineY && inst.Y + inst.H >= this.hitLineY) {
                this.keyLastActiveT.set(inst.Pitch, t);
                this.keyLastTint.set(inst.Pitch, tint);
                this.keyLastGlowTint.set(inst.Pitch, borderTint);
                // Pure geometry, no stored "note start" needed: the note's
                // bottom edge sits exactly at the hit line at the instant
                // it starts sounding (see drawlist's yBottom formula), so
                // this reconstructs that instant from the current frame's
                // Y/H alone — automatically correct across seeks/scrubs.
                const elapsedSinceStart = (inst.Y + inst.H - this.hitLineY) / this.scrollSpeed;
                this.keyOnsetT.set(inst.Pitch, t - elapsedSinceStart);
            }

            const clippedHeight = Math.max(Math.min(inst.Y + inst.H, this.hitLineY) - inst.Y, 0);
            if (clippedHeight <= 0) {
                fill.visible = false;
                border.visible = false;
                glow.visible = false;
                return;
            }

            const w = Math.max(inst.W - 1, 1); // hairline gap between keys
            fill.visible = true;
            fill.x = inst.X;
            fill.y = inst.Y;
            fill.width = w;
            fill.height = clippedHeight;
            fill.tint = tint;
            fill.alpha = NOTE_FILL_ALPHA + (1 - NOTE_FILL_ALPHA) * 0.3 * inst.Glow; // glassy, brightens slightly with velocity

            border.visible = true;
            border.x = inst.X;
            border.y = inst.Y;
            border.width = w;
            border.height = clippedHeight;
            border.tint = borderTint;

            if (!inst.GlowEnabled) {
                glow.visible = false;
                return;
            }
            const glowBottom = Math.min(inst.Y + inst.H + GLOW_PADDING, this.hitLineY);
            const glowHeight = Math.max(glowBottom - (inst.Y - GLOW_PADDING), 0);
            if (glowHeight <= 0) {
                glow.visible = false;
                return;
            }
            glow.visible = true;
            glow.x = inst.X - GLOW_PADDING;
            glow.y = inst.Y - GLOW_PADDING;
            glow.width = w + GLOW_PADDING * 2;
            glow.height = glowHeight;
            glow.tint = borderTint;
            glow.alpha = GLOW_ALPHA * (0.5 + 0.5 * inst.Glow);
        });
        for (let i = instances.length; i < this.fillPool.length; i++) {
            this.fillPool[i].visible = false;
            this.borderPool[i].visible = false;
            this.glowPool[i].visible = false;
        }

        // Key press visuals: full brightness while a note is active, fading
        // out afterward as a function of t so the fade is deterministic and
        // identical between live preview and export. The shade (neutral
        // pressed-key look) and accent (track-colored strip) fade together.
        // The hit line's own per-key segment follows the same fade, easing
        // from HIT_LINE_IDLE_TINT/height up to that key's glow color/full
        // height while active, and back down as it fades — plus a matching
        // blurred bloom band (hitGlow) that's only ever visible while lit.
        for (const [pitch, visual] of this.keyVisuals) {
            const lastActiveT = this.keyLastActiveT.get(pitch);
            if (lastActiveT === undefined) {
                visual.shade.visible = false;
                visual.accent.visible = false;
                visual.hitBar.tint = HIT_LINE_IDLE_TINT;
                visual.hitBar.height = HIT_LINE_HEIGHT;
                visual.hitBar.y = this.hitLineY - HIT_LINE_HEIGHT / 2;
                visual.hitGlow.visible = false;
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

                const glowTint = this.keyLastGlowTint.get(pitch)!;
                visual.hitBar.tint = lerpColor(HIT_LINE_IDLE_TINT, glowTint, alpha);
                visual.hitBar.height = HIT_LINE_HEIGHT + (HIT_LINE_ACTIVE_HEIGHT - HIT_LINE_HEIGHT) * alpha;
                visual.hitBar.y = this.hitLineY - visual.hitBar.height / 2;
                visual.hitGlow.visible = true;
                visual.hitGlow.tint = glowTint;
                visual.hitGlow.alpha = alpha;
            } else {
                visual.hitBar.tint = HIT_LINE_IDLE_TINT;
                visual.hitBar.height = HIT_LINE_HEIGHT;
                visual.hitBar.y = this.hitLineY - HIT_LINE_HEIGHT / 2;
                visual.hitGlow.visible = false;
            }
        }

        this.updateSparks(t);
        this.updateSmoke(t);
    }

    // Deterministic ember stream from each key active within SPARK_LINGER
    // of now (not just THIS exact frame) — embers keep drifting up briefly
    // after a note releases instead of cutting off instantly.
    private updateSparks(t: number) {
        let count = 0;
        const currentCycle = Math.floor(t / SPARK_INTERVAL);

        for (const [pitch, lastActiveT] of this.keyLastActiveT) {
            const sinceActive = t - lastActiveT;
            if (sinceActive < 0 || sinceActive > SPARK_LINGER) continue;
            const visual = this.keyVisuals.get(pitch);
            if (!visual) continue;
            const centerX = visual.accent.x + visual.accent.width / 2;
            const glowTint = this.keyLastGlowTint.get(pitch) ?? 0xffffff;

            for (let back = 0; back < SPARK_CYCLES; back++) {
                const cycle = currentCycle - back;
                if (cycle < 0) continue;
                const age = t - cycle * SPARK_INTERVAL;
                if (age < 0 || age >= SPARK_LIFETIME) continue;

                const seed = pitch * 100000 + cycle;
                const lifeFrac = age / SPARK_LIFETIME;
                const dirSign = hash(seed) < 0.5 ? -1 : 1;
                const curlAmount = SPARK_CURL * (0.6 + 0.5 * hash(seed + 0.37));
                const curlOffset = dirSign * curlAmount * Math.sin(lifeFrac * Math.PI);
                const sizeJitter = 0.7 + 0.6 * hash(seed + 0.83);

                const spark = this.getPooledSprite(this.sparkPool, this.sparkContainer, this.sparkTexture, count);
                spark.visible = true;
                spark.x = centerX + curlOffset;
                spark.y = this.hitLineY - SPARK_RISE * lifeFrac;
                spark.width = SPARK_SIZE * sizeJitter;
                spark.height = SPARK_SIZE * sizeJitter;
                spark.tint = glowTint;
                // Fades faster near the top of the rise (lifeFrac -> 1),
                // not just a steady fade — matches "fade towards the top".
                spark.alpha = Math.pow(Math.max(1 - lifeFrac, 0), 1.6);
                count++;
            }
        }

        count = this.updateImpactBursts(t, count);
        this.updateNoteSmoke(t);

        for (let i = count; i < this.sparkPool.length; i++) {
            this.sparkPool[i].visible = false;
        }
    }

    // One-time radial spray per note onset (age since keyOnsetT is small),
    // rather than a repeating spawn cycle — this only ever fires once per
    // note, right when it starts sounding. Shares the spark pool/container
    // (continues its index sequence) so it gets the same additive blending.
    // Also draws one bright white flash — the actual "hit" cue — ahead of
    // the colored embers.
    private updateImpactBursts(t: number, count: number): number {
        for (const [pitch, onsetT] of this.keyOnsetT) {
            const age = t - onsetT;
            const visual = this.keyVisuals.get(pitch);
            if (!visual) continue;
            const centerX = visual.accent.x + visual.accent.width / 2;
            const glowTint = this.keyLastGlowTint.get(pitch) ?? 0xffffff;

            if (age >= 0 && age < FLASH_LIFETIME) {
                const flashFrac = age / FLASH_LIFETIME;
                const flash = this.getPooledSprite(this.sparkPool, this.sparkContainer, this.sparkTexture, count);
                flash.visible = true;
                flash.x = centerX;
                flash.y = this.hitLineY;
                const size = FLASH_SIZE * (0.4 + 0.6 * flashFrac); // expands
                flash.width = size;
                flash.height = size;
                flash.tint = 0xffffff;
                flash.alpha = 1 - flashFrac; // fast fade
                count++;
            }

            if (age < 0 || age >= IMPACT_BURST_LIFETIME) continue;
            const lifeFrac = age / IMPACT_BURST_LIFETIME;

            for (let i = 0; i < IMPACT_BURST_COUNT; i++) {
                const seed = pitch * 100000 + i;
                // Signed spread so the burst sprays both left and right,
                // wider than the steady trickle, easing out from center.
                const xJitter = (hash(seed) - 0.5) * 2 * IMPACT_BURST_SPREAD;
                const riseMul = 0.4 + 0.6 * hash(seed + 0.53);
                const size = IMPACT_BURST_SIZE * (1 - lifeFrac * 0.5);

                const spark = this.getPooledSprite(this.sparkPool, this.sparkContainer, this.sparkTexture, count);
                spark.visible = true;
                spark.x = centerX + xJitter * lifeFrac;
                spark.y = this.hitLineY - IMPACT_BURST_RISE * riseMul * lifeFrac;
                spark.width = size;
                spark.height = size;
                spark.tint = glowTint;
                spark.alpha = Math.sqrt(Math.max(1 - lifeFrac, 0));
                count++;
            }
        }
        return count;
    }

    // Light smoke wisps shrouding each note's sparks specifically — unlike
    // updateSmoke's fixed ambient positions, these follow whichever keys
    // are actually active (or just released, within NOTE_SMOKE_LINGER),
    // and use their own pool/container so they render between the notes
    // and the sparks.
    private updateNoteSmoke(t: number) {
        let count = 0;
        for (const [pitch, lastActiveT] of this.keyLastActiveT) {
            const sinceActive = t - lastActiveT;
            if (sinceActive < 0 || sinceActive > NOTE_SMOKE_LINGER) continue;
            const onsetT = this.keyOnsetT.get(pitch);
            if (onsetT === undefined) continue;
            const visual = this.keyVisuals.get(pitch);
            if (!visual) continue;
            const centerX = visual.accent.x + visual.accent.width / 2;

            const elapsed = t - onsetT;
            const currentCycle = Math.floor(elapsed / NOTE_SMOKE_INTERVAL);

            for (let back = 0; back < NOTE_SMOKE_CYCLES; back++) {
                const cycle = currentCycle - back;
                if (cycle < 0) continue;
                const age = elapsed - cycle * NOTE_SMOKE_INTERVAL;
                if (age < 0 || age >= NOTE_SMOKE_LIFETIME) continue;

                const seed = pitch * 100000 + cycle;
                const lifeFrac = age / NOTE_SMOKE_LIFETIME;
                const drift = (hash(seed + 0.61) - 0.5) * 2 * NOTE_SMOKE_DRIFT;
                const size = NOTE_SMOKE_SIZE * (0.5 + 0.7 * lifeFrac);

                const puff = this.getPooledSprite(this.noteSmokePool, this.noteSmokeContainer, this.smokeTexture, count);
                puff.visible = true;
                puff.x = centerX + drift * age;
                puff.y = this.hitLineY - NOTE_SMOKE_RISE * lifeFrac;
                puff.width = size;
                puff.height = size;
                puff.tint = 0xdddddd;
                puff.alpha = NOTE_SMOKE_ALPHA * Math.sin(Math.PI * Math.min(lifeFrac, 1));
                count++;
            }
        }
        for (let i = count; i < this.noteSmokePool.length; i++) {
            this.noteSmokePool[i].visible = false;
        }
    }

    // Ambient haze at smokePuffCount fixed positions along the hit line's
    // width (spaced closely enough to overlap into a continuous haze),
    // independent of which notes are playing.
    private updateSmoke(t: number) {
        let count = 0;
        const currentCycle = Math.floor(t / SMOKE_INTERVAL);

        for (let p = 0; p < this.smokePuffCount; p++) {
            const centerX = ((p + 0.5) / this.smokePuffCount) * this.width;
            // Offsetting each position's phase (via hash) keeps puffs from
            // all pulsing in visible lockstep.
            const phase = hash(p * 7919);

            for (let back = 0; back < SMOKE_CYCLES; back++) {
                const cycle = currentCycle - back;
                if (cycle < 0) continue;
                const age = t - (cycle + phase) * SMOKE_INTERVAL;
                if (age < 0 || age >= SMOKE_LIFETIME) continue;

                const seed = p * 100000 + cycle;
                const lifeFrac = age / SMOKE_LIFETIME;
                const drift = (hash(seed + 0.21) - 0.5) * 2 * SMOKE_DRIFT;
                const size = SMOKE_SIZE * (0.6 + 0.6 * lifeFrac);

                const puff = this.getPooledSprite(this.smokePool, this.smokeContainer, this.smokeTexture, count);
                puff.visible = true;
                puff.x = centerX + drift * age;
                puff.y = this.hitLineY - SMOKE_RISE * lifeFrac;
                puff.width = size;
                puff.height = size;
                puff.tint = 0xcccccc;
                puff.alpha = SMOKE_ALPHA * Math.sin(Math.PI * lifeFrac); // fades in, then out
                count++;
            }
        }
        for (let i = count; i < this.smokePool.length; i++) {
            this.smokePool[i].visible = false;
        }
    }

    // Returns pool[index], growing the pool (and adding new sprites to
    // container) on demand if it isn't that long yet.
    private getPooledSprite(pool: Sprite[], container: Container, texture: Texture, index: number): Sprite {
        while (pool.length <= index) {
            const s = new Sprite(texture);
            s.visible = false;
            s.anchor.set(0.5);
            container.addChild(s);
            pool.push(s);
        }
        return pool[index];
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
        this.keyLastGlowTint.clear();
        this.keyOnsetT.clear();
        for (const visual of this.keyVisuals.values()) {
            visual.shade.visible = false;
            visual.accent.visible = false;
            visual.hitBar.tint = HIT_LINE_IDLE_TINT;
            visual.hitBar.height = HIT_LINE_HEIGHT;
            visual.hitBar.y = this.hitLineY - HIT_LINE_HEIGHT / 2;
            visual.hitGlow.visible = false;
        }
        for (const spark of this.sparkPool) spark.visible = false;
        for (const puff of this.noteSmokePool) puff.visible = false;
    }

    /** Renders the current sprite state to the canvas immediately. */
    renderFrame() {
        this.app.renderer.render(this.app.stage);
    }

    destroy() {
        this.app.destroy(true, {children: true});
        this.fillTexture.destroy(true);
        this.borderTexture.destroy(true);
        this.smokeTexture.destroy(true);
        this.sparkTexture.destroy(true);
    }

    private ensurePoolSize(n: number) {
        while (this.fillPool.length < n) {
            const fill = new NineSliceSprite({
                texture: this.fillTexture,
                leftWidth: NOTE_CORNER_RADIUS,
                rightWidth: NOTE_CORNER_RADIUS,
                topHeight: NOTE_CORNER_RADIUS,
                bottomHeight: NOTE_CORNER_RADIUS,
                width: 1,
                height: 1,
            });
            fill.visible = false;
            this.fillPool.push(fill);

            const border = new NineSliceSprite({
                texture: this.borderTexture,
                leftWidth: NOTE_CORNER_RADIUS,
                rightWidth: NOTE_CORNER_RADIUS,
                topHeight: NOTE_CORNER_RADIUS,
                bottomHeight: NOTE_CORNER_RADIUS,
                width: 1,
                height: 1,
            });
            border.visible = false;
            this.borderPool.push(border);
            this.noteContainer.addChild(fill, border); // border on top of its own fill

            const glow = new NineSliceSprite({
                texture: this.borderTexture, // the ring, not the fill — see GLOW_PADDING's comment
                leftWidth: NOTE_CORNER_RADIUS,
                rightWidth: NOTE_CORNER_RADIUS,
                topHeight: NOTE_CORNER_RADIUS,
                bottomHeight: NOTE_CORNER_RADIUS,
                width: 1,
                height: 1,
            });
            glow.visible = false;
            this.glowContainer.addChild(glow);
            this.glowPool.push(glow);
        }
    }
}

function hexToTint(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}
