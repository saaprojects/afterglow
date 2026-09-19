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

	// ScrollSpeed is how fast notes fall, in pixels per second at the
	// project's Resolution.
	ScrollSpeed float64 `json:"scrollSpeed"`

	Resolution Resolution `json:"resolution"`
	FPS        int        `json:"fps"`
}

// TrackSettings overrides rendering for a single MIDI track.
type TrackSettings struct {
	Track  int    `json:"track"`
	Color  string `json:"color"` // hex, e.g. "#3399ff"
	Hidden bool   `json:"hidden,omitempty"`
}

// Resolution is an export/preview frame size in pixels.
type Resolution struct {
	Width  int `json:"width"`
	Height int `json:"height"`
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
		Version:     CurrentVersion,
		MIDIFile:    midiFile,
		ScrollSpeed: 300,
		Resolution:  Resolution{Width: 1920, Height: 1080},
		FPS:         60,
	}
}

// TrackSettingsFor returns the settings for the given track index, falling
// back to a default color and visible=true if there's no explicit entry.
func (p *Project) TrackSettingsFor(track int) TrackSettings {
	for _, ts := range p.Tracks {
		if ts.Track == track {
			return ts
		}
	}
	return TrackSettings{Track: track, Color: DefaultColorForTrack(track)}
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
