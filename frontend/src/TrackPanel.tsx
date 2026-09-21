import {type CSSProperties, useEffect, useState} from 'react';
import {SetTrackSettings, TrackList} from '../wailsjs/go/main/App';
import {main} from '../wailsjs/go/models';

interface Props {
    onClose: () => void;
}

type TrackPatch = Partial<Pick<main.TrackInfo, 'color' | 'glowColor' | 'glowDisabled' | 'hidden'>>;

export default function TrackPanel({onClose}: Props) {
    const [tracks, setTracks] = useState<main.TrackInfo[]>([]);
    const [status, setStatus] = useState('loading…');

    useEffect(() => {
        TrackList()
            .then((list) => {
                setTracks(list);
                setStatus(list.length === 0 ? 'no tracks with notes' : '');
            })
            .catch((e) => setStatus(`error: ${e instanceof Error ? e.message : String(e)}`));
    }, []);

    function updateTrack(track: number, patch: TrackPatch) {
        // Compute the merged value directly from the tracks state already
        // in scope, rather than trying to read it back out of a setTracks
        // updater — that updater isn't guaranteed to run synchronously
        // (native-dialog-originated events like this color picker's don't
        // get React's synchronous-flush treatment), so reading a variable
        // it sets, right after calling it, is a race.
        const current = tracks.find((t) => t.track === track);
        if (!current) return;
        const updated: main.TrackInfo = {...current, ...patch};

        setTracks((prev) => prev.map((t) => (t.track === track ? updated : t)));

        SetTrackSettings(track, updated.color, updated.glowColor, updated.glowDisabled, updated.hidden)
            .then(() => setStatus(''))
            .catch((e) => setStatus(`error: ${e instanceof Error ? e.message : String(e)}`));
    }

    return (
        <div style={overlayStyle}>
            <div style={panelStyle}>
                <h3 style={{marginTop: 0}}>Tracks</h3>

                {tracks.map((t) => (
                    <div key={t.track} style={trackBlockStyle}>
                        <div style={{marginBottom: 6}}>Track {t.track} ({t.noteCount} notes)</div>
                        <div style={rowStyle}>
                            <label style={labelStyle}>
                                Color
                                <input
                                    type="color"
                                    value={t.color}
                                    onChange={(e) => updateTrack(t.track, {color: e.target.value})}
                                />
                            </label>
                        </div>
                        <div style={rowStyle}>
                            <label style={labelStyle}>
                                Glow
                                <input
                                    type="color"
                                    value={t.glowColor}
                                    disabled={t.glowDisabled}
                                    onChange={(e) => updateTrack(t.track, {glowColor: e.target.value})}
                                />
                            </label>
                        </div>
                        <div style={rowStyle}>
                            <label style={labelStyle}>
                                <input
                                    type="checkbox"
                                    checked={!t.glowDisabled}
                                    onChange={(e) => updateTrack(t.track, {glowDisabled: !e.target.checked})}
                                />
                                Glow on
                            </label>
                        </div>
                        <div style={rowStyle}>
                            <label style={labelStyle}>
                                <input
                                    type="checkbox"
                                    checked={t.hidden}
                                    onChange={(e) => updateTrack(t.track, {hidden: e.target.checked})}
                                />
                                Hidden
                            </label>
                        </div>
                    </div>
                ))}

                <div style={{...rowStyle, marginTop: 16}}>
                    <button onClick={onClose}>Close</button>
                </div>
                <div style={{marginTop: 8, wordBreak: 'break-all'}}>{status}</div>
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
    minWidth: 320,
    maxWidth: 480,
};

const trackBlockStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottom: '1px solid #333',
};

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
};

const labelStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
};
