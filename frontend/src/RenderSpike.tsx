import {useEffect, useRef, useState} from 'react';
import {Application, Container, Sprite, Texture} from 'pixi.js';

const RECT_COUNT = 10000;

interface Instance {
    sprite: Sprite;
    speed: number;
}

export default function RenderSpike() {
    const hostRef = useRef<HTMLDivElement>(null);
    const [fps, setFps] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const app = new Application();
        let cleanup = () => {
        };

        (async () => {
            await app.init({
                resizeTo: window,
                background: '#101018',
                antialias: false,
            });
            if (cancelled) {
                app.destroy(true, {children: true});
                return;
            }
            hostRef.current?.appendChild(app.canvas);

            const container = new Container();
            app.stage.addChild(container);

            const instances: Instance[] = [];
            for (let i = 0; i < RECT_COUNT; i++) {
                const sprite = new Sprite(Texture.WHITE);
                sprite.width = 4;
                sprite.height = 12;
                sprite.tint = Math.random() * 0xffffff;
                sprite.x = Math.random() * app.screen.width;
                sprite.y = Math.random() * app.screen.height;
                container.addChild(sprite);
                instances.push({sprite, speed: 60 + Math.random() * 200});
            }

            const tick = (ticker: {deltaMS: number}) => {
                const dtSeconds = ticker.deltaMS / 1000;
                const height = app.screen.height;
                for (const instance of instances) {
                    instance.sprite.y += instance.speed * dtSeconds;
                    if (instance.sprite.y > height) {
                        instance.sprite.y = -instance.sprite.height;
                        instance.sprite.x = Math.random() * app.screen.width;
                    }
                }
            };
            app.ticker.add(tick);

            const fpsInterval = setInterval(() => {
                setFps(Math.round(app.ticker.FPS));
            }, 500);

            cleanup = () => {
                clearInterval(fpsInterval);
                app.ticker.remove(tick);
                app.destroy(true, {children: true});
            };
        })();

        return () => {
            cancelled = true;
            cleanup();
        };
    }, []);

    return (
        <div style={{position: 'relative', width: '100vw', height: '100vh'}}>
            <div ref={hostRef} style={{width: '100%', height: '100%'}}/>
            <div style={{
                position: 'absolute', top: 8, left: 8, color: '#0f0',
                fontFamily: 'monospace', fontSize: 16, background: 'rgba(0,0,0,0.5)',
                padding: '4px 8px', borderRadius: 4,
            }}>
                {RECT_COUNT.toLocaleString()} rects — {fps} fps
            </div>
        </div>
    );
}
