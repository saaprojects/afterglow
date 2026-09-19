// Package midi loads Standard MIDI Files into a flat, time-sorted list of
// notes. It has no UI and no OS-specific dependencies.
package midi

import (
	"fmt"
	"sort"

	"gitlab.com/gomidi/midi/v2/smf"
)

// Note is a single played note, with timing resolved from ticks to seconds
// via the file's tempo map.
type Note struct {
	Start    float64 // seconds from the start of the file
	Duration float64 // seconds
	Pitch    uint8   // MIDI key number, 0-127
	Velocity uint8   // note-on velocity, 0-127
	Track    int     // index into the file's track list
}

// noteKey identifies an in-progress note within a track: a note-on and its
// matching note-off must share both channel and pitch. Two channels playing
// the same pitch at once are tracked independently.
type noteKey struct {
	channel uint8
	pitch   uint8
}

// Load reads a Standard MIDI File and returns every note it contains,
// sorted by start time (ties broken by pitch). Notes may arrive in any
// order and with any spacing in the source file; delta-tick accumulation
// makes no assumption about a fixed grid.
func Load(path string) ([]Note, error) {
	s, err := smf.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("midi: reading %s: %w", path, err)
	}

	type openNote struct {
		startTicks int64
		velocity   uint8
	}

	var notes []Note

	for trackIndex, track := range s.Tracks {
		var absTicks int64
		open := map[noteKey]openNote{}

		for _, ev := range track {
			absTicks += int64(ev.Delta)

			var channel, key, velocity uint8
			if ev.Message.GetNoteStart(&channel, &key, &velocity) {
				open[noteKey{channel, key}] = openNote{startTicks: absTicks, velocity: velocity}
				continue
			}
			if ev.Message.GetNoteEnd(&channel, &key) {
				k := noteKey{channel, key}
				on, ok := open[k]
				if !ok {
					continue // stray note-off with no matching note-on
				}
				delete(open, k)

				startMicro := s.TimeAt(on.startTicks)
				endMicro := s.TimeAt(absTicks)

				notes = append(notes, Note{
					Start:    float64(startMicro) / 1_000_000,
					Duration: float64(endMicro-startMicro) / 1_000_000,
					Pitch:    key,
					Velocity: on.velocity,
					Track:    trackIndex,
				})
			}
		}
	}

	sort.Slice(notes, func(i, j int) bool {
		if notes[i].Start != notes[j].Start {
			return notes[i].Start < notes[j].Start
		}
		return notes[i].Pitch < notes[j].Pitch
	})

	return notes, nil
}
