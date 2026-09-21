package main

import (
	"context"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"afterglow/core/drawlist"
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

// ProjectInfo is what the frontend needs to know after opening a project:
// enough to size the canvas and drive a play/pause timeline.
type ProjectInfo struct {
	DurationSeconds float64            `json:"durationSeconds"`
	Width           int                `json:"width"`
	Height          int                `json:"height"`
	FPS             int                `json:"fps"`
	HasAudio        bool               `json:"hasAudio"`
	Keyboard        []drawlist.KeyRect `json:"keyboard"`
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
		Width:           tl.Project.Resolution.Width,
		Height:          tl.Project.Resolution.Height,
		FPS:             tl.Project.FPS,
		HasAudio:        tl.Project.AudioFile != "",
		Keyboard:        drawlist.Keyboard(float64(tl.Project.Resolution.Width)),
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
// currently open project.
func (a *App) DrawListAt(t float64) ([]drawlist.Instance, error) {
	if a.timeline == nil {
		return nil, fmt.Errorf("no project open")
	}
	return drawlist.DrawList(a.timeline, t), nil
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
