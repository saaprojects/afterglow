import {useState} from 'react';
import {
    BufferSource,
    BufferTarget,
    CanvasSource,
    canEncodeVideo,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    Quality,
    WAVE,
} from 'mediabunny';
import {AudioBytes, DrawListAt, KeyboardAt, OpenProject, SaveVideoAs} from '../wailsjs/go/main/App';
import {Scene} from './scene';
import {decodeWailsBytes} from './wailsBytes';
import {RESOLUTIONS} from './resolutions';

interface Props {
    projectPath: string;
}

// Renders the whole song frame-by-frame, off the live preview's timeline
// entirely: time always advances as frame/fps (never the wall clock), so
// the export is deterministic and reproducible. It shares Scene with
// Preview, so a given instance list draws identically in both. fps is
// always the fixed default (never user-configurable) — only resolution is
// chosen per export, since picking a render size is the common need
// (e.g. exporting the same project at 4K vs 1080p).
export default function ExportButton({projectPath}: Props) {
    const [showPicker, setShowPicker] = useState(false);
    const [resolutionIndex, setResolutionIndex] = useState(0);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');

    async function runExport(width: number, height: number) {
        setBusy(true);
        let scene: Scene | null = null;
        try {
            setStatus('opening project…');
            const info = await OpenProject(projectPath);

            setStatus('checking codec support…');
            const supported = await canEncodeVideo('avc', {width, height, frameRate: info.fps});
            if (!supported) {
                setStatus('WebCodecs H.264 ("avc") is not supported in this WebView2. Stopping per plan.');
                return;
            }

            const keyboard = await KeyboardAt(width);
            // no host: renders off-screen
            scene = await Scene.create({width, height, keyboard});

            const output = new Output({
                format: new Mp4OutputFormat(),
                target: new BufferTarget(),
            });
            const videoSource = new CanvasSource(scene.app.canvas, {
                codec: 'avc',
                quality: new Quality('high'),
            });
            output.addVideoTrack(videoSource);

            let audioConversion: Conversion | null = null;
            if (info.hasAudio) {
                setStatus('loading audio…');
                const audioBytes = decodeWailsBytes(await AudioBytes());
                const audioInput = new Input({
                    source: new BufferSource(audioBytes),
                    formats: [WAVE],
                });
                audioConversion = await Conversion.init({
                    input: audioInput,
                    output,
                    composable: true,
                    video: {discard: true},
                    // Force AAC: without this, Mediabunny copies the WAV's
                    // raw PCM samples into an ISOBMFF "ipcm" box, which is
                    // valid but unsupported by most media players.
                    audio: {codec: 'aac', quality: new Quality('high'), forceTranscode: true},
                });
            }

            await output.start();

            if (audioConversion) {
                setStatus('muxing audio…');
                await audioConversion.execute();
            }

            const frameCount = Math.max(1, Math.ceil(info.durationSeconds * info.fps));
            for (let frame = 0; frame < frameCount; frame++) {
                const t = frame / info.fps;
                const instances = await DrawListAt(t, width, height);
                scene.update(instances, t);
                scene.renderFrame();
                await videoSource.add(t, 1 / info.fps);

                if (frame % 30 === 0 || frame === frameCount - 1) {
                    setStatus(`rendering frame ${frame + 1} / ${frameCount}…`);
                }
            }

            await output.finalize();
            const buffer = (output.target as BufferTarget).buffer;
            if (!buffer) {
                setStatus('finalize produced no buffer');
                return;
            }

            setStatus(`encoded ${buffer.byteLength.toLocaleString()} bytes, choose where to save…`);
            const bytes = Array.from(new Uint8Array(buffer));
            const savedPath = await SaveVideoAs(bytes, 'afterglow-export.mp4');
            setStatus(savedPath ? `saved to ${savedPath}` : 'save cancelled');
        } catch (e) {
            setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            scene?.destroy();
            setBusy(false);
        }
    }

    function startExport() {
        setShowPicker(false);
        const {width, height} = RESOLUTIONS[resolutionIndex];
        void runExport(width, height);
    }

    return (
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
            {!showPicker && (
                <button disabled={busy} onClick={() => setShowPicker(true)}>
                    {busy ? 'Exporting…' : 'Export video'}
                </button>
            )}
            {showPicker && (
                <>
                    <select value={resolutionIndex} onChange={(e) => setResolutionIndex(Number(e.target.value))}>
                        {RESOLUTIONS.map((r, i) => (
                            <option key={r.label} value={i}>{r.label}</option>
                        ))}
                    </select>
                    <button onClick={startExport}>Start</button>
                    <button onClick={() => setShowPicker(false)}>Cancel</button>
                </>
            )}
            {status && <span>{status}</span>}
        </span>
    );
}
