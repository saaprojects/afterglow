// Package drawlist turns a Timeline and a point in time into the flat list
// of rectangles a renderer should draw that frame. This is the seam
// between core and any renderer: renderers only ever consume []Instance.
package drawlist

import (
	"sort"

	"afterglow/core/timeline"
)

// Instance is one rectangle to render, in pixel space at the project's
// configured resolution.
type Instance struct {
	X, Y, W, H float64
	Color      string  // hex, from the note's track settings
	Glow       float64 // 0..1, derived from note velocity
}

// HitLineFraction is where the hit line sits, as a fraction of frame
// height measured from the top. A note's rectangle reaches the hit line
// exactly at its start time and finishes crossing it at start+duration.
const HitLineFraction = 0.85

// keyboard range: a standard 88-key piano, A0 (21) to C8 (108).
const (
	lowestPitch = 21
	numPitches  = 88
)

// DrawList returns the instances visible at time t (seconds) for every
// unhidden note whose falling rectangle overlaps the frame.
//
// tl.Notes must be sorted by Start ascending (midi.Load guarantees this).
// Two binary searches bound the candidate range so no per-frame work
// touches the full note list: the lower bound is widened by the song's
// longest note duration so a long note that started earlier is never
// missed. A song with one pathologically long note alongside many short
// ones would widen that window more than necessary; an interval tree
// would fix that, but isn't warranted for typical piano MIDI.
func DrawList(tl *timeline.Timeline, t float64) []Instance {
	p := tl.Project
	notes := tl.Notes
	if len(notes) == 0 || p.ScrollSpeed <= 0 {
		return nil
	}

	height := float64(p.Resolution.Height)
	hitLineY := height * HitLineFraction
	lookaheadUp := hitLineY / p.ScrollSpeed
	trailingWindow := (height - hitLineY) / p.ScrollSpeed

	upperBoundStart := t + lookaheadUp
	lowerBoundStart := t - trailingWindow - tl.MaxNoteDuration()

	lo := sort.Search(len(notes), func(i int) bool {
		return notes[i].Start >= lowerBoundStart
	})
	hi := sort.Search(len(notes), func(i int) bool {
		return notes[i].Start > upperBoundStart
	})

	columnWidth := float64(p.Resolution.Width) / float64(numPitches)

	var instances []Instance
	for _, n := range notes[lo:hi] {
		if n.Start+n.Duration < t-trailingWindow {
			continue // already scrolled fully past the bottom of the frame
		}

		settings := p.TrackSettingsFor(n.Track)
		if settings.Hidden {
			continue
		}

		yBottom := hitLineY + (t-n.Start)*p.ScrollSpeed
		h := n.Duration * p.ScrollSpeed

		instances = append(instances, Instance{
			X:     pitchX(n.Pitch, columnWidth),
			Y:     yBottom - h,
			W:     columnWidth,
			H:     h,
			Color: settings.Color,
			Glow:  float64(n.Velocity) / 127,
		})
	}

	return instances
}

func pitchX(pitch uint8, columnWidth float64) float64 {
	idx := int(pitch) - lowestPitch
	if idx < 0 {
		idx = 0
	}
	if idx >= numPitches {
		idx = numPitches - 1
	}
	return float64(idx) * columnWidth
}
