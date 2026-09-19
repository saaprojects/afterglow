import {type ChangeEvent, useEffect, useRef, useState} from 'react';
import {Application, Container, Graphics, Sprite, Texture} from 'pixi.js';
import {DrawListAt, OpenProject} from '../wailsjs/go/main/App';
import {drawlist} from '../wailsjs/go/models';

const PROJECT_PATH = 'testdata/grand-piano.afterglow.json';
const HIT_LINE_FRACTION = 0.85; // must match core/drawlist.HitLineFraction

function hexToTint(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}

export default function Preview() {
    const hostRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState('loading project…');
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [displayTime, setDisplayTime] = useState(0);

    // Mutable playback state PixiJS's ticker reads/writes directly, so
    // React re-renders never happen on the per-frame path (only the
    // throttled setDisplayTime below touches React state during playback).
    const playingRef = useRef(false);
    const timeRef = useRef(0);
    const durationRef = useRef(0);

    useEffect(() => {
        let cancelled = false;
        const app = new Application();
        let cleanup = () => {
        };

        (async () => {
            const info = await OpenProject(PROJECT_PATH);
            if (cancelled) return;
            durationRef.current = info.durationSeconds;
            setDuration(info.durationSeconds);

            await app.init({
                width: info.width,
                height: info.height,
                background: '#101018',
                antialias: false,
            });
            if (cancelled) {
                app.destroy(true, {children: true});
                return;
            }
            hostRef.current?.appendChild(app.canvas);

            const hitLine = new Graphics()
                .rect(0, info.height * HIT_LINE_FRACTION, info.width, 2)
                .fill(0x666666);
            app.stage.addChild(hitLine);

            const noteContainer = new Container();
            app.stage.addChild(noteContainer);

            const pool: Sprite[] = [];
            function ensurePoolSize(n: number) {
                while (pool.length < n) {
                    const s = new Sprite(Texture.WHITE);
                    s.visible = false;
                    noteContainer.addChild(s);
                    pool.push(s);
                }
            }
            function render(instances: drawlist.Instance[]) {
                ensurePoolSize(instances.length);
                instances.forEach((inst, i) => {
                    const s = pool[i];
                    s.visible = true;
                    s.x = inst.X;
                    s.y = inst.Y;
                    s.width = Math.max(inst.W - 1, 1); // hairline gap between keys
                    s.height = Math.max(inst.H, 1);
                    s.tint = hexToTint(inst.Color);
                    s.alpha = 0.55 + 0.45 * inst.Glow;
                });
                for (let i = instances.length; i < pool.length; i++) {
                    pool[i].visible = false;
                }
            }

            let inFlight = false;
            const tick = (ticker: {deltaMS: number}) => {
                if (playingRef.current) {
                    timeRef.current = Math.min(timeRef.current + ticker.deltaMS / 1000, durationRef.current);
                    if (timeRef.current >= durationRef.current) {
                        playingRef.current = false;
                        setPlaying(false);
                    }
                }
                if (!inFlight) {
                    inFlight = true;
                    DrawListAt(timeRef.current)
                        .then((instances) => {
                            render(instances);
                            inFlight = false;
                        })
                        .catch(() => {
                            inFlight = false;
                        });
                }
            };
            app.ticker.add(tick);

            const displayInterval = setInterval(() => {
                setDisplayTime(timeRef.current);
            }, 100);

            setStatus('ready');

            cleanup = () => {
                clearInterval(displayInterval);
                app.ticker.remove(tick);
                app.destroy(true, {children: true});
            };
        })().catch((e) => {
            setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
        });

        return () => {
            cancelled = true;
            cleanup();
        };
    }, []);

    function togglePlay() {
        const next = !playingRef.current;
        if (next && timeRef.current >= durationRef.current) {
            timeRef.current = 0; // restart from the top if replaying after the end
        }
        playingRef.current = next;
        setPlaying(next);
    }

    function seek(e: ChangeEvent<HTMLInputElement>) {
        const t = Number(e.target.value);
        timeRef.current = t;
        setDisplayTime(t);
    }

    return (
        <div style={{padding: 16, fontFamily: 'monospace', color: '#eee', background: '#181820', height: '100vh'}}>
            <div ref={hostRef} style={{display: 'inline-block', border: '1px solid #333'}}/>
            <div style={{marginTop: 12, display: 'flex', alignItems: 'center', gap: 12}}>
                <button onClick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
                <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.01}
                    value={displayTime}
                    onChange={seek}
                    style={{width: 400}}
                />
                <span>{displayTime.toFixed(2)}s / {duration.toFixed(2)}s</span>
                <span>{status}</span>
            </div>
        </div>
    );
}
