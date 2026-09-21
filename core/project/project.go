// Package project defines the versioned project file: the single source of
// truth that both the UI and the CLI read from and write to. It has no UI
// and no OS-specific dependencies.
package project

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// CurrentVersion is the schema version written by this build. Load rejects
// files with a different version so schema changes are never silently
// misinterpreted.
const CurrentVersion = 1

// Project is the versioned project file contents.
type Project struct {
	Version int `json:"version"`

	// MIDIFile is the input MIDI file path. If relative, it is resolved
	// relative to the project file's own directory (see ResolveMIDIPath).
	MIDIFile string `json:"midiFile"`

	// AudioFile is an optional audio file played alongside the video in
	// preview and export. Empty means no audio. Resolved the same way as
	// MIDIFile (see ResolveAudioPath).
	AudioFile string `json:"audioFile,omitempty"`

	// Tracks holds per-track overrides, keyed by the MIDI track index
	// (core/midi's Note.Track). Tracks without an entry fall back to
	// DefaultColorForTrack and are not hidden.
	Tracks []TrackSettings `json:"tracks,omitempty"`
}

// TrackSettings overrides rendering for a single MIDI track.
type TrackSettings struct {
	Track int    `json:"track"`
	Color string `json:"color"` // hex, e.g. "#3399ff" — the note/key fill

	// GlowColor is the note's glow/halo color, independent of Color. If
	// empty, TrackSettingsFor defaults it to match Color.
	GlowColor string `json:"glowColor,omitempty"`

	// GlowDisabled turns off the glow/halo entirely for this track. An
	// opt-out (default false = glow on) so existing tracks keep glowing.
	GlowDisabled bool `json:"glowDisabled,omitempty"`

	Hidden bool `json:"hidden,omitempty"`
}

// defaultColors cycles for tracks with no explicit TrackSettings entry, so
// an unconfigured project still renders each track distinctly.
var defaultColors = []string{
	"#3399ff", "#ff6b6b", "#4dd48c", "#ffb84d",
	"#c77dff", "#4dd4d4", "#ff8fb3", "#a3d977",
}

// DefaultColorForTrack returns the fallback color for a track with no
// explicit TrackSettings entry.
func DefaultColorForTrack(track int) string {
	if track < 0 {
		track = 0
	}
	return defaultColors[track%len(defaultColors)]
}

// New returns a Project with sensible defaults for the given MIDI file.
func New(midiFile string) *Project {
	return &Project{
		Version:  CurrentVersion,
		MIDIFile: midiFile,
	}
}

// TrackSettingsFor returns the settings for the given track index, falling
// back to a default color and visible=true if there's no explicit entry.
// GlowColor defaults to Color whenever it isn't explicitly set, so a
// track's glow matches its key color until deliberately overridden.
func (p *Project) TrackSettingsFor(track int) TrackSettings {
	for _, ts := range p.Tracks {
		if ts.Track == track {
			if ts.GlowColor == "" {
				ts.GlowColor = ts.Color
			}
			return ts
		}
	}
	color := DefaultColorForTrack(track)
	return TrackSettings{Track: track, Color: color, GlowColor: color}
}

// ResolveMIDIPath returns MIDIFile resolved relative to the project file's
// directory, if it isn't already absolute.
func (p *Project) ResolveMIDIPath(projectFilePath string) string {
	return resolvePath(p.MIDIFile, projectFilePath)
}

// ResolveAudioPath returns AudioFile resolved relative to the project
// file's directory, if it isn't already absolute. Returns "" if there's no
// audio file configured.
func (p *Project) ResolveAudioPath(projectFilePath string) string {
	if p.AudioFile == "" {
		return ""
	}
	return resolvePath(p.AudioFile, projectFilePath)
}

func resolvePath(target, projectFilePath string) string {
	if target == "" || filepath.IsAbs(target) {
		return target
	}
	return filepath.Join(filepath.Dir(projectFilePath), target)
}

// Load reads and validates a project file.
func Load(path string) (*Project, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("project: reading %s: %w", path, err)
	}

	var p Project
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("project: parsing %s: %w", path, err)
	}

	if p.Version != CurrentVersion {
		return nil, fmt.Errorf("project: %s has version %d, want %d", path, p.Version, CurrentVersion)
	}

	return &p, nil
}

// Save writes the project file as indented JSON.
func Save(path string, p *Project) error {
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return fmt.Errorf("project: encoding: %w", err)
	}
	data = append(data, '\n')

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("project: writing %s: %w", path, err)
	}
	return nil
}
