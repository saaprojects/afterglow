package project

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestNew_Defaults(t *testing.T) {
	p := New("song.mid")

	if p.Version != CurrentVersion {
		t.Errorf("Version = %d, want %d", p.Version, CurrentVersion)
	}
	if p.MIDIFile != "song.mid" {
		t.Errorf("MIDIFile = %q, want %q", p.MIDIFile, "song.mid")
	}
}

func TestSaveLoad_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.afterglow.json")

	want := New("song.mid")
	want.AudioFile = "song.wav"
	want.Tracks = []TrackSettings{
		{Track: 0, Color: "#ff0000"},
		{Track: 2, Color: "#00ff00", Hidden: true},
	}

	if err := Save(path, want); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	got, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if !reflect.DeepEqual(want, got) {
		t.Errorf("round-tripped project = %+v, want %+v", got, want)
	}
}

func TestLoad_MissingFile(t *testing.T) {
	if _, err := Load(filepath.Join(t.TempDir(), "does-not-exist.json")); err == nil {
		t.Fatal("Load() with missing file: want error, got nil")
	}
}

func TestLoad_UnsupportedVersion(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.afterglow.json")

	if err := os.WriteFile(path, []byte(`{"version": 999, "midiFile": "song.mid"}`), 0o644); err != nil {
		t.Fatalf("writing fixture: %v", err)
	}

	if _, err := Load(path); err == nil {
		t.Fatal("Load() with unsupported version: want error, got nil")
	}
}

func TestResolvePaths(t *testing.T) {
	tests := []struct {
		name            string
		midiFile        string
		audioFile       string
		projectFilePath string
		wantMIDI        string
		wantAudio       string
	}{
		{
			name:            "relative paths resolved against project dir",
			midiFile:        "song.mid",
			audioFile:       "song.wav",
			projectFilePath: filepath.FromSlash("/projects/mysong/mysong.afterglow.json"),
			wantMIDI:        filepath.FromSlash("/projects/mysong/song.mid"),
			wantAudio:       filepath.FromSlash("/projects/mysong/song.wav"),
		},
		{
			name:            "absolute paths passed through unchanged",
			midiFile:        `C:\elsewhere\song.mid`,
			projectFilePath: filepath.FromSlash("/projects/mysong/mysong.afterglow.json"),
			wantMIDI:        `C:\elsewhere\song.mid`,
			wantAudio:       "",
		},
		{
			name:            "empty audio file resolves to empty",
			midiFile:        "song.mid",
			audioFile:       "",
			projectFilePath: filepath.FromSlash("/projects/mysong/mysong.afterglow.json"),
			wantMIDI:        filepath.FromSlash("/projects/mysong/song.mid"),
			wantAudio:       "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := &Project{MIDIFile: tt.midiFile, AudioFile: tt.audioFile}

			if got := p.ResolveMIDIPath(tt.projectFilePath); got != tt.wantMIDI {
				t.Errorf("ResolveMIDIPath() = %q, want %q", got, tt.wantMIDI)
			}
			if got := p.ResolveAudioPath(tt.projectFilePath); got != tt.wantAudio {
				t.Errorf("ResolveAudioPath() = %q, want %q", got, tt.wantAudio)
			}
		})
	}
}

func TestTrackSettingsFor(t *testing.T) {
	p := &Project{
		Tracks: []TrackSettings{
			{Track: 1, Color: "#ff0000", Hidden: true},
		},
	}

	if got := p.TrackSettingsFor(1); got.Color != "#ff0000" || !got.Hidden {
		t.Errorf("TrackSettingsFor(1) = %+v, want explicit override", got)
	}

	fallback := p.TrackSettingsFor(0)
	if fallback.Hidden {
		t.Errorf("TrackSettingsFor(0) = %+v, want Hidden=false by default", fallback)
	}
	if fallback.Color != DefaultColorForTrack(0) {
		t.Errorf("TrackSettingsFor(0).Color = %q, want default %q", fallback.Color, DefaultColorForTrack(0))
	}
}
