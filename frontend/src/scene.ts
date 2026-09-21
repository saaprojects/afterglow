import {Application, Container, Graphics, Sprite, Texture} from 'pixi.js';
import {drawlist} from '../wailsjs/go/models';

// Must match core/drawlist.HitLineFraction.
export const HIT_LINE_FRACTION = 0.85;

export interface SceneSize {
    width: number;
    height: number;
}

// Scene draws a drawlist.Instance[] onto a PixiJS canvas. It is the single
// place that turns instances into pixels, so preview (driven by a ticker)
// and export (stepped frame-by-frame) are guaranteed to render identically
// for the same instance list.
export class Scene {
    readonly app: Application;
    private readonly pool: Sprite[] = [];
    private readonly noteContainer: Container;

    private constructor(app: Application, noteContainer: Container) {
        this.app = app;
        this.noteContainer = noteContainer;
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

        const hitLine = new Graphics()
            .rect(0, size.height * HIT_LINE_FRACTION, size.width, 2)
            .fill(0x666666);
        app.stage.addChild(hitLine);

        const noteContainer = new Container();
        app.stage.addChild(noteContainer);

        return new Scene(app, noteContainer);
    }

    /** Updates sprites to match instances. Does not render/present a frame. */
    update(instances: drawlist.Instance[]) {
        this.ensurePoolSize(instances.length);
        instances.forEach((inst, i) => {
            const s = this.pool[i];
            s.visible = true;
            s.x = inst.X;
            s.y = inst.Y;
            s.width = Math.max(inst.W - 1, 1); // hairline gap between keys
            s.height = Math.max(inst.H, 1);
            s.tint = hexToTint(inst.Color);
            s.alpha = 0.55 + 0.45 * inst.Glow;
        });
        for (let i = instances.length; i < this.pool.length; i++) {
            this.pool[i].visible = false;
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
