import {type ChangeEvent, useEffect, useRef, useState} from 'react';
import {AudioBytes, DrawListAt, OpenProject, OpenProjectDialog} from '../wailsjs/go/main/App';
import {KEY_FADE_SECONDS, Scene} from './scene';
import ExportButton from './ExportButton';
import {decodeWailsBytes} from './wailsBytes';

const DEFAULT_PROJECT_PATH = 'testdata/chiodos.afterglow.json';

function basename(path: string): string {
    return path.split(/[/\\]/).pop() ?? path;
}

export default function Preview() {
    const hostRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [projectPath, setProjectPath] = useState(DEFAULT_PROJECT_PATH);
    const [status, setStatus] = useState('loading project…');
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [displayTime, setDisplayTime] = useState(0);

    // Mutable playback state PixiJS's ticker reads/writes directly, so
    // React re-renders never happen on the per-frame path (only the
    // throttled setDisplayTime below touches React state during playback).
    // When audio is present it's the master clock (read each tick, never
    // accumulated) so video and audio can't drift apart.
    const playingRef = useRef(false);
    const timeRef = useRef(0);
    const durationRef = useRef(0);
    const hasAudioRef = useRef(false);
    const sceneRef = useRef<Scene | null>(null);

    useEffect(() => {
        let cancelled = false;
        let scene: Scene | null = null;
        let audioURL: string | null = null;
        let cleanup = () => {
        };

        playingRef.current = false;
        timeRef.current = 0;
        hasAudioRef.current = false;
        setPlaying(false);
        setDisplayTime(0);
        setStatus('loading project…');

        (async () => {
            const info = await OpenProject(projectPath);
            if (cancelled) return;
            durationRef.current = info.durationSeconds;
            setDuration(info.durationSeconds);

            let audioStatus = 'no audio';
            if (info.hasAudio && audioRef.current) {
                const bytes = decodeWailsBytes(await AudioBytes());
                const blob = new Blob([bytes], {type: 'audio/wav'});
                audioURL = URL.createObjectURL(blob);
                audioRef.current.src = audioURL;
                hasAudioRef.current = true;
                audioStatus = `audio: ${bytes.length.toLocaleString()} bytes`;
            } else if (audioRef.current) {
                audioRef.current.removeAttribute('src');
            }

            scene = await Scene.create(
                {width: info.width, height: info.height, keyboard: info.keyboard},
                hostRef.current,
            );
            if (cancelled) {
                scene.destroy();
                return;
            }
            sceneRef.current = scene;

            // How much real time to keep advancing past the nominal end
            // before actually stopping playback, so the last note(s) —
            // which are, by definition, still "active" at t=duration —
            // get to fade out through the normal t-based mechanism instead
            // of freezing mid-note. Comfortably longer than the fade itself.
            const END_GRACE_SECONDS = KEY_FADE_SECONDS + 0.2;
            let endGraceRemaining: number | null = null;

            let inFlight = false;
            const tick = (ticker: {deltaMS: number}) => {
                if (playingRef.current) {
                    if (hasAudioRef.current && audioRef.current) {
                        timeRef.current = audioRef.current.currentTime;
                        if (audioRef.current.ended && endGraceRemaining === null) {
                            endGraceRemaining = END_GRACE_SECONDS;
                        }
                    } else {
                        timeRef.current += ticker.deltaMS / 1000;
                        if (timeRef.current >= durationRef.current && endGraceRemaining === null) {
                            endGraceRemaining = END_GRACE_SECONDS;
                        }
                    }

                    if (endGraceRemaining !== null) {
                        endGraceRemaining -= ticker.deltaMS / 1000;
                        if (endGraceRemaining <= 0) {
                            playingRef.current = false;
                            setPlaying(false);
                            scene?.clearKeyHighlights();
                            endGraceRemaining = null;
                        }
                    }
                }
                if (!inFlight) {
                    inFlight = true;
                    const sampledT = timeRef.current;
                    DrawListAt(sampledT)
                        .then((instances) => {
                            scene?.update(instances, sampledT);
                            scene?.renderFrame();
                            inFlight = false;
                        })
                        .catch(() => {
                            inFlight = false;
                        });
                }
            };
            scene.app.ticker.add(tick);

            const displayInterval = setInterval(() => {
                setDisplayTime(Math.min(timeRef.current, durationRef.current));
            }, 100);

            setStatus(`ready (${audioStatus})`);

            cleanup = () => {
                clearInterval(displayInterval);
                scene?.app.ticker.remove(tick);
                scene?.destroy();
                sceneRef.current = null;
                if (audioURL) URL.revokeObjectURL(audioURL);
            };
        })().catch((e) => {
            setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
        });

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [projectPath]);

    function togglePlay() {
        const next = !playingRef.current;
        if (next && timeRef.current >= durationRef.current) {
            timeRef.current = 0; // restart from the top if replaying after the end
            if (audioRef.current) audioRef.current.currentTime = 0;
        }
        playingRef.current = next;
        setPlaying(next);

        if (hasAudioRef.current && audioRef.current) {
            if (next) {
                audioRef.current.play().catch((e) => {
                    setStatus(`audio play() failed: ${e instanceof Error ? e.message : String(e)}`);
                });
            } else {
                audioRef.current.pause();
            }
        }
        if (!next) {
            sceneRef.current?.clearKeyHighlights();
        }
    }

    const AUDIO_ERROR_NAMES: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
    };

    function onAudioError() {
        const err = audioRef.current?.error;
        if (err) {
            setStatus(`audio error: ${AUDIO_ERROR_NAMES[err.code] ?? err.code} — ${err.message}`);
        }
    }

    function seek(e: ChangeEvent<HTMLInputElement>) {
        const t = Number(e.target.value);
        timeRef.current = t;
        setDisplayTime(t);
        if (audioRef.current) audioRef.current.currentTime = t;
        sceneRef.current?.clearKeyHighlights(); // avoid stale fades from before the jump
    }

    async function openProjectDialog() {
        const result = await OpenProjectDialog();
        if (result.path) {
            setProjectPath(result.path);
        }
    }

    return (
        <div style={{padding: 16, fontFamily: 'monospace', color: '#eee', background: '#181820', height: '100vh'}}>
            <div style={{marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12}}>
                <button onClick={() => void openProjectDialog()}>Open Project…</button>
                <span>{basename(projectPath)}</span>
            </div>
            <div ref={hostRef} style={{display: 'inline-block', border: '1px solid #333'}}/>
            <audio ref={audioRef} onError={onAudioError}/>
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
                <ExportButton projectPath={projectPath}/>
                <span>{status}</span>
            </div>
        </div>
    );
}
