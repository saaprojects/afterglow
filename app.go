package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"afterglow/core/drawlist"
	"afterglow/core/timeline"
)

// App struct
type App struct {
	ctx      context.Context
	timeline *timeline.Timeline
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
	DurationSeconds float64 `json:"durationSeconds"`
	Width           int     `json:"width"`
	Height          int     `json:"height"`
	FPS             int     `json:"fps"`
}

// OpenProject loads the project file and its referenced MIDI file, and
// becomes the source for subsequent DrawListAt calls.
func (a *App) OpenProject(path string) (ProjectInfo, error) {
	tl, err := timeline.Load(path)
	if err != nil {
		return ProjectInfo{}, err
	}
	a.timeline = tl

	return ProjectInfo{
		DurationSeconds: tl.Duration(),
		Width:           tl.Project.Resolution.Width,
		Height:          tl.Project.Resolution.Height,
		FPS:             tl.Project.FPS,
	}, nil
}

// DrawListAt returns the instances to render at time t (seconds) for the
// currently open project.
func (a *App) DrawListAt(t float64) ([]drawlist.Instance, error) {
	if a.timeline == nil {
		return nil, fmt.Errorf("no project open")
	}
	return drawlist.DrawList(a.timeline, t), nil
}

// SaveExportedVideo writes exported video bytes into the project's gitignored
// tmp/ folder for local inspection, returning the absolute path written.
func (a *App) SaveExportedVideo(data []byte, filename string) (string, error) {
	dir := "tmp"
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, filename)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", err
	}
	return filepath.Abs(path)
}
