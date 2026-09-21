package main

import (
	"context"
	"fmt"
	"os"

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
