import {useState} from 'react';
import {BufferTarget, CanvasSource, canEncodeVideo, Mp4OutputFormat, Output, Quality} from 'mediabunny';
import {SaveExportedVideo} from '../wailsjs/go/main/App';

const WIDTH = 640;
const HEIGHT = 360;
const FPS = 30;
const DURATION_SECONDS = 5;
const FRAME_COUNT = FPS * DURATION_SECONDS;

function drawFrame(ctx: CanvasRenderingContext2D, frameIndex: number) {
    const t = frameIndex / FPS;

    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const x = (t / DURATION_SECONDS) * (WIDTH - 40);
    ctx.fillStyle = '#ff3366';
    ctx.fillRect(x, HEIGHT / 2 - 20, 40, 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = '20px monospace';
    ctx.fillText(`frame ${frameIndex}  t=${t.toFixed(2)}s`, 20, 30);
}

export default function ExportSpike() {
    const [status, setStatus] = useState('idle');
    const [busy, setBusy] = useState(false);

    async function runExport() {
        setBusy(true);
        try {
            setStatus('checking codec support…');
            const supported = await canEncodeVideo('avc', {width: WIDTH, height: HEIGHT, frameRate: FPS});
            if (!supported) {
                setStatus('WebCodecs H.264 ("avc") is not supported in this WebView2. Stopping per plan.');
                return;
            }

            setStatus('encoding frames…');

            const canvas = document.createElement('canvas');
            canvas.width = WIDTH;
            canvas.height = HEIGHT;
            const ctx = canvas.getContext('2d')!;

            const output = new Output({
                format: new Mp4OutputFormat(),
                target: new BufferTarget(),
            });
            const videoSource = new CanvasSource(canvas, {
                codec: 'avc',
                quality: new Quality('high'),
            });
            output.addVideoTrack(videoSource);

            await output.start();
            for (let i = 0; i < FRAME_COUNT; i++) {
                drawFrame(ctx, i);
                await videoSource.add(i / FPS, 1 / FPS);
            }
            await output.finalize();

            const buffer = (output.target as BufferTarget).buffer;
            if (!buffer) {
                setStatus('finalize produced no buffer');
                return;
            }

            setStatus(`encoded ${buffer.byteLength.toLocaleString()} bytes, saving…`);
            const bytes = Array.from(new Uint8Array(buffer));
            const savedPath = await SaveExportedVideo(bytes, 'afterglow-export-spike.mp4');
            setStatus(`saved to ${savedPath}`);
        } catch (e) {
            setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{padding: 24, fontFamily: 'monospace', color: '#eee', background: '#181820', height: '100vh'}}>
            <h2>Export spike</h2>
            <button disabled={busy} onClick={() => void runExport()}>
                Encode {DURATION_SECONDS}s H.264 MP4
            </button>
            <p>{status}</p>
        </div>
    );
}
