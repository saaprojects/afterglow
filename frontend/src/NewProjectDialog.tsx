import {type CSSProperties, useState} from 'react';
import {CreateProject, PickAudioFile, PickMIDIFile} from '../wailsjs/go/main/App';

interface Props {
    onCreated: (path: string) => void;
    onClose: () => void;
}

function basename(path: string): string {
    return path.split(/[/\\]/).pop() ?? path;
}

export default function NewProjectDialog({onCreated, onClose}: Props) {
    const [midiFile, setMidiFile] = useState('');
    const [audioFile, setAudioFile] = useState('');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);

    async function pickMidi() {
        const path = await PickMIDIFile();
        if (path) setMidiFile(path);
    }

    async function pickAudio() {
        const path = await PickAudioFile();
        if (path) setAudioFile(path);
    }

    async function create() {
        if (!midiFile) return;
        setBusy(true);
        setStatus('saving…');
        try {
            const result = await CreateProject({midiFile, audioFile});
            if (result.path) {
                onCreated(result.path);
            } else {
                setStatus('cancelled');
                setBusy(false);
            }
        } catch (e) {
            setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
            setBusy(false);
        }
    }

    return (
        <div style={overlayStyle}>
            <div style={panelStyle}>
                <h3 style={{marginTop: 0}}>New Project</h3>

                <div style={rowStyle}>
                    <button onClick={() => void pickMidi()}>Choose MIDI…</button>
                    <span>{midiFile ? basename(midiFile) : '(required)'}</span>
                </div>

                <div style={rowStyle}>
                    <button onClick={() => void pickAudio()}>Choose Audio…</button>
                    <span>{audioFile ? basename(audioFile) : '(optional)'}</span>
                    {audioFile && <button onClick={() => setAudioFile('')}>Clear</button>}
                </div>

                <div style={{...rowStyle, marginTop: 16}}>
                    <button onClick={onClose} disabled={busy}>Cancel</button>
                    <button onClick={() => void create()} disabled={!midiFile || busy}>
                        {busy ? 'Creating…' : 'Create'}
                    </button>
                    <span>{status}</span>
                </div>
            </div>
        </div>
    );
}

const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
};

const panelStyle: CSSProperties = {
    background: '#181820',
    color: '#eee',
    fontFamily: 'monospace',
    padding: 24,
    borderRadius: 6,
    border: '1px solid #333',
    minWidth: 360,
};

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
};
