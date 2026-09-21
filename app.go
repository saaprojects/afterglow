package main

import (
	"context"
	"fmt"
	"os"
	"sort"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"afterglow/core/drawlist"
	"afterglow/core/project"
	"afterglow/core/timeline"
)

// App struct
type App struct {
	ctx             context.Context
	timeline        *timeline.Timeline
	projectFilePath string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// DefaultFPS is the frame rate everything renders at. Not user-configurable:
// playback speed should always feel the same regardless of project or
// export choice.
const DefaultFPS = 60

// ProjectInfo is what the frontend needs to know after opening a project.
// Resolution isn't part of it — that's chosen per render (live preview
// picks its own fixed internal size; export prompts for one) rather than
// stored on the project, via DrawListAt/KeyboardAt's explicit width/height.
type ProjectInfo struct {
	DurationSeconds float64 `json:"durationSeconds"`
	FPS             int     `json:"fps"`
	HasAudio        bool    `json:"hasAudio"`
}

// OpenProject loads the project file and its referenced MIDI file, and
// becomes the source for subsequent DrawListAt and AudioBytes calls.
func (a *App) OpenProject(path string) (ProjectInfo, error) {
	tl, err := timeline.Load(path)
	if err != nil {
		return ProjectInfo{}, err
	}
	a.timeline = tl
	a.projectFilePath = path

	return ProjectInfo{
		DurationSeconds: tl.Duration(),
		FPS:             DefaultFPS,
		HasAudio:        tl.Project.AudioFile != "",
	}, nil
}

// OpenProjectResult carries a picked project's path alongside its info, so
// the frontend can tell "user cancelled" (empty Path) apart from a
// legitimately loaded project.
type OpenProjectResult struct {
	Path string      `json:"path"`
	Info ProjectInfo `json:"info"`
}

// OpenProjectDialog prompts the user to pick a project file and opens it.
// Returns a zero-value result (empty Path, no error) if the user cancels.
func (a *App) OpenProjectDialog() (OpenProjectResult, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open project",
		Filters: []runtime.FileFilter{
			{DisplayName: "Afterglow Project (*.afterglow.json)", Pattern: "*.afterglow.json"},
		},
	})
	if err != nil || path == "" {
		return OpenProjectResult{}, err
	}

	info, err := a.OpenProject(path)
	if err != nil {
		return OpenProjectResult{}, err
	}
	return OpenProjectResult{Path: path, Info: info}, nil
}

// PickMIDIFile prompts the user to choose a MIDI file. Returns "" (no
// error) if the user cancels.
func (a *App) PickMIDIFile() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Choose a MIDI file",
		Filters: []runtime.FileFilter{
			{DisplayName: "MIDI Files (*.mid;*.midi)", Pattern: "*.mid;*.midi"},
		},
	})
}

// PickAudioFile prompts the user to choose a WAV audio file. Returns ""
// (no error) if the user cancels.
func (a *App) PickAudioFile() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Choose an audio file",
		Filters: []runtime.FileFilter{
			{DisplayName: "WAV Audio (*.wav)", Pattern: "*.wav"},
		},
	})
}

// NewProjectSettings is what the frontend collects from the user to build
// a new project file: just the source media. Resolution/fps/scroll speed
// aren't project properties (see ProjectInfo).
type NewProjectSettings struct {
	MIDIFile  string `json:"midiFile"`
	AudioFile string `json:"audioFile"`
}

// CreateProject prompts the user for a save location, writes a new project
// file with the given settings, and opens it. Returns a zero-value result
// (empty Path, no error) if the user cancels the save dialog.
func (a *App) CreateProject(settings NewProjectSettings) (OpenProjectResult, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save new project",
		DefaultFilename: "untitled.afterglow.json",
		Filters: []runtime.FileFilter{
			{DisplayName: "Afterglow Project (*.afterglow.json)", Pattern: "*.afterglow.json"},
		},
	})
	if err != nil || path == "" {
		return OpenProjectResult{}, err
	}

	p := project.New(settings.MIDIFile)
	p.AudioFile = settings.AudioFile

	if err := project.Save(path, p); err != nil {
		return OpenProjectResult{}, err
	}

	info, err := a.OpenProject(path)
	if err != nil {
		return OpenProjectResult{}, err
	}
	return OpenProjectResult{Path: path, Info: info}, nil
}

// AudioBytes returns the raw bytes of the current project's audio file
// (always WAV). Errors if no project is open or it has no audio file.
func (a *App) AudioBytes() ([]byte, error) {
	if a.timeline == nil {
		return nil, fmt.Errorf("no project open")
	}
	path := a.timeline.Project.ResolveAudioPath(a.projectFilePath)
	if path == "" {
		return nil, fmt.Errorf("project has no audio file")
	}
	return os.ReadFile(path)
}

// DrawListAt returns the instances to render at time t (seconds) for the
// currently open project, at the given width/height. Used by both the
// live preview (a fixed internal resolution) and export (whatever
// resolution the user picked for that render).
func (a *App) DrawListAt(t float64, width, height int) ([]drawlist.Instance, error) {
	if a.timeline == nil {
		return nil, fmt.Errorf("no project open")
	}
	return drawlist.DrawList(a.timeline, t, float64(width), float64(height)), nil
}

// KeyboardAt returns the piano key layout for the given width.
func (a *App) KeyboardAt(width int) []drawlist.KeyRect {
	return drawlist.Keyboard(float64(width))
}

// TrackInfo is one MIDI track's current color/visibility settings, along
// with how many notes it actually has (so the UI can skip empty tracks).
type TrackInfo struct {
	Track        int    `json:"track"`
	NoteCount    int    `json:"noteCount"`
	Color        string `json:"color"`
	GlowColor    string `json:"glowColor"`
	GlowDisabled bool   `json:"glowDisabled"`
	Hidden       bool   `json:"hidden"`
}

// TrackList returns info for every track that has at least one note in
// the currently open project, sorted by track index.
func (a *App) TrackList() ([]TrackInfo, error) {
	if a.timeline == nil {
		return nil, fmt.Errorf("no project open")
	}

	counts := map[int]int{}
	for _, n := range a.timeline.Notes {
		counts[n.Track]++
	}

	tracks := make([]int, 0, len(counts))
	for t := range counts {
		tracks = append(tracks, t)
	}
	sort.Ints(tracks)

	infos := make([]TrackInfo, 0, len(tracks))
	for _, t := range tracks {
		settings := a.timeline.Project.TrackSettingsFor(t)
		infos = append(infos, TrackInfo{
			Track:        t,
			NoteCount:    counts[t],
			Color:        settings.Color,
			GlowColor:    settings.GlowColor,
			GlowDisabled: settings.GlowDisabled,
			Hidden:       settings.Hidden,
		})
	}
	return infos, nil
}

// SetTrackSettings updates a track's color/glow/visibility and persists
// the change to the project file immediately (the in-memory project is
// the same one DrawListAt reads, so the change takes effect on the very
// next frame — no need to reopen the project).
func (a *App) SetTrackSettings(track int, color, glowColor string, glowDisabled, hidden bool) error {
	if a.timeline == nil {
		return fmt.Errorf("no project open")
	}

	p := a.timeline.Project
	found := false
	for i, ts := range p.Tracks {
		if ts.Track == track {
			p.Tracks[i].Color = color
			p.Tracks[i].GlowColor = glowColor
			p.Tracks[i].GlowDisabled = glowDisabled
			p.Tracks[i].Hidden = hidden
			found = true
			break
		}
	}
	if !found {
		p.Tracks = append(p.Tracks, project.TrackSettings{
			Track: track, Color: color, GlowColor: glowColor, GlowDisabled: glowDisabled, Hidden: hidden,
		})
	}

	return project.Save(a.projectFilePath, p)
}

// SaveVideoAs prompts the user for a destination and writes the exported
// video bytes there. Returns "" (no error) if the user cancels.
func (a *App) SaveVideoAs(data []byte, defaultFilename string) (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save exported video",
		DefaultFilename: defaultFilename,
		Filters: []runtime.FileFilter{
			{DisplayName: "MP4 Video (*.mp4)", Pattern: "*.mp4"},
		},
	})
	if err != nil || path == "" {
		return "", err
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", err
	}
	return path, nil
}
