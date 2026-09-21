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
        let updated: main.TrackInfo | undefined;
        setTracks((prev) =>
            prev.map((t) => {
                if (t.track !== track) return t;
                updated = {...t, ...patch};
                return updated;
            }),
        );
        if (!updated) return;
        SetTrackSettings(track, updated.color, updated.glowColor, updated.glowDisabled, updated.hidden).catch((e) => {
            setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
        });
    }

    return (
        <div style={overlayStyle}>
            <div style={panelStyle}>
                <h3 style={{marginTop: 0}}>Tracks</h3>

                {tracks.map((t) => (
                    <div key={t.track} style={rowStyle}>
                        <span style={{minWidth: 130}}>Track {t.track} ({t.noteCount} notes)</span>
                        <label style={labelStyle}>
                            Color
                            <input
                                type="color"
                                value={t.color}
                                onChange={(e) => updateTrack(t.track, {color: e.target.value})}
                            />
                        </label>
                        <label style={labelStyle}>
                            Glow
                            <input
                                type="color"
                                value={t.glowColor}
                                disabled={t.glowDisabled}
                                onChange={(e) => updateTrack(t.track, {glowColor: e.target.value})}
                            />
                        </label>
                        <label style={labelStyle}>
                            <input
                                type="checkbox"
                                checked={!t.glowDisabled}
                                onChange={(e) => updateTrack(t.track, {glowDisabled: !e.target.checked})}
                            />
                            Glow on
                        </label>
                        <label style={labelStyle}>
                            <input
                                type="checkbox"
                                checked={t.hidden}
                                onChange={(e) => updateTrack(t.track, {hidden: e.target.checked})}
                            />
                            Hidden
                        </label>
                    </div>
                ))}

                <div style={{...rowStyle, marginTop: 16}}>
                    <button onClick={onClose}>Close</button>
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
    minWidth: 460,
};

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
};

const labelStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
};
