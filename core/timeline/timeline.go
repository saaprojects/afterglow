// Package timeline ties a loaded Project to its parsed MIDI notes: the
// bundle draw-list generation needs to turn (project, time) into pixels.
package timeline

import (
	"afterglow/core/midi"
	"afterglow/core/project"
)

// Timeline is a Project paired with its notes, sorted by Start ascending
// (as returned by midi.Load).
type Timeline struct {
	Project *project.Project
	Notes   []midi.Note

	maxNoteDuration float64
}

// New builds a Timeline from an already-loaded project and note list.
func New(p *project.Project, notes []midi.Note) *Timeline {
	tl := &Timeline{Project: p, Notes: notes}
	for _, n := range notes {
		if n.Duration > tl.maxNoteDuration {
			tl.maxNoteDuration = n.Duration
		}
	}
	return tl
}

// Load reads the project file at projectFilePath and the MIDI file it
// references, and returns the combined Timeline.
func Load(projectFilePath string) (*Timeline, error) {
	p, err := project.Load(projectFilePath)
	if err != nil {
		return nil, err
	}

	notes, err := midi.Load(p.ResolveMIDIPath(projectFilePath))
	if err != nil {
		return nil, err
	}

	return New(p, notes), nil
}

// MaxNoteDuration returns the longest note's duration in seconds, or 0 if
// there are no notes. drawlist uses this to size its search window so an
// unusually long note is never missed.
func (tl *Timeline) MaxNoteDuration() float64 {
	return tl.maxNoteDuration
}

// Duration returns the time in seconds at which the last note ends, or 0
// if there are no notes.
func (tl *Timeline) Duration() float64 {
	var d float64
	for _, n := range tl.Notes {
		if end := n.Start + n.Duration; end > d {
			d = end
		}
	}
	return d
}
