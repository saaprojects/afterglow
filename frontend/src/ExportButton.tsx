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
import {AudioBytes, DrawListAt, OpenProject, SaveVideoAs} from '../wailsjs/go/main/App';
import {Scene} from './scene';
import {decodeWailsBytes} from './wailsBytes';

interface Props {
    projectPath: string;
}

// Renders the whole song frame-by-frame, off the live preview's timeline
// entirely: time always advances as frame/fps (never the wall clock), so
// the export is deterministic and reproducible. It shares Scene with
// Preview, so a given instance list draws identically in both.
export default function ExportButton({projectPath}: Props) {
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');

    async function runExport() {
        setBusy(true);
        let scene: Scene | null = null;
        try {
            setStatus('opening project…');
            const info = await OpenProject(projectPath);

            setStatus('checking codec support…');
            const supported = await canEncodeVideo('avc', {
                width: info.width,
                height: info.height,
                frameRate: info.fps,
            });
            if (!supported) {
                setStatus('WebCodecs H.264 ("avc") is not supported in this WebView2. Stopping per plan.');
                return;
            }

            scene = await Scene.create({width: info.width, height: info.height}); // no host: renders off-screen

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
                const instances = await DrawListAt(t);
                scene.update(instances);
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

    return (
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
            <button disabled={busy} onClick={() => void runExport()}>
                {busy ? 'Exporting…' : 'Export video'}
            </button>
            {status && <span>{status}</span>}
        </span>
    );
}
