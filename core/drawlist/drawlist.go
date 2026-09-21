// Package drawlist turns a Timeline and a point in time into the flat list
// of rectangles a renderer should draw that frame. This is the seam
// between core and any renderer: renderers only ever consume []Instance.
package drawlist

import (
	"sort"

	"afterglow/core/timeline"
)

// Instance is one rectangle to render, in pixel space at the requested
// width/height.
type Instance struct {
	X, Y, W, H float64
	Color      string  // hex, from the note's track settings
	Glow       float64 // 0..1, derived from note velocity
	Pitch      uint8   // which key this note is on, for renderers that highlight keys
}

// HitLineFraction is where the hit line sits, as a fraction of frame
// height measured from the top. A note's rectangle reaches the hit line
// exactly at its start time and finishes crossing it at start+duration.
const HitLineFraction = 0.85

// LookaheadSeconds is how long a note takes to fall from the top of the
// frame to the hit line. This is the only thing that determines fall
// speed — there's no separate user-configurable scroll speed, since
// resolution (and therefore pixels-per-second) is chosen per render, not
// stored on the project. Expressing speed as a lookahead time rather than
// a pixel rate keeps the note timing feel identical across resolutions.
const LookaheadSeconds = 3.0

// DrawList returns the instances visible at time t (seconds) for every
// unhidden note whose falling rectangle overlaps a frame of the given
// width/height.
//
// tl.Notes must be sorted by Start ascending (midi.Load guarantees this).
// Two binary searches bound the candidate range so no per-frame work
// touches the full note list: the lower bound is widened by the song's
// longest note duration so a long note that started earlier is never
// missed. A song with one pathologically long note alongside many short
// ones would widen that window more than necessary; an interval tree
// would fix that, but isn't warranted for typical piano MIDI.
func DrawList(tl *timeline.Timeline, t float64, width, height float64) []Instance {
	p := tl.Project
	notes := tl.Notes
	if len(notes) == 0 {
		return nil
	}

	hitLineY := height * HitLineFraction
	scrollSpeed := hitLineY / LookaheadSeconds
	lookaheadUp := LookaheadSeconds
	trailingWindow := (height - hitLineY) / scrollSpeed

	upperBoundStart := t + lookaheadUp
	lowerBoundStart := t - trailingWindow - tl.MaxNoteDuration()

	lo := sort.Search(len(notes), func(i int) bool {
		return notes[i].Start >= lowerBoundStart
	})
	hi := sort.Search(len(notes), func(i int) bool {
		return notes[i].Start > upperBoundStart
	})

	keyboard := Keyboard(width)

	var instances []Instance
	for _, n := range notes[lo:hi] {
		if n.Start+n.Duration < t-trailingWindow {
			continue // already scrolled fully past the bottom of the frame
		}

		settings := p.TrackSettingsFor(n.Track)
		if settings.Hidden {
			continue
		}

		key := keyRectForPitch(keyboard, n.Pitch)
		yBottom := hitLineY + (t-n.Start)*scrollSpeed
		h := n.Duration * scrollSpeed

		instances = append(instances, Instance{
			X:     key.X,
			Y:     yBottom - h,
			W:     key.W,
			H:     h,
			Color: settings.Color,
			Glow:  float64(n.Velocity) / 127,
			Pitch: n.Pitch,
		})
	}

	return instances
}
