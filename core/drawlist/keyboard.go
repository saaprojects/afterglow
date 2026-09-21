package drawlist

// keyboard range: a standard 88-key piano, A0 (21) to C8 (108).
const (
	lowestPitch  = 21
	highestPitch = 108
	numPitches   = highestPitch - lowestPitch + 1
	numWhiteKeys = 52
)

// KeyRect is one piano key's horizontal geometry, in pixel space at a
// given width. It's the single source of truth for where a pitch sits on
// screen: falling-note instances and the visual keyboard strip both derive
// their X/W from it, so notes always land exactly on their key.
type KeyRect struct {
	Pitch uint8
	X, W  float64
	Black bool
}

// isBlackKey reports whether pitch is a black key (sharp/flat), using
// pitch%12 as the pitch class (0=C, 1=C#, 2=D, ... matching MIDI, where
// e.g. 60=C4 and 60%12=0).
func isBlackKey(pitch uint8) bool {
	switch pitch % 12 {
	case 1, 3, 6, 8, 10: // C#, D#, F#, G#, A#
		return true
	default:
		return false
	}
}

// Keyboard returns the geometry for every key from A0 to C8 at the given
// total width. White keys are evenly spaced, full-width columns. Each
// black key is centered exactly on the boundary between the two white
// keys it sits between (a common simplification of real piano spacing,
// where the black keys within a group of three aren't perfectly even) and
// is narrower than a white key.
func Keyboard(width float64) []KeyRect {
	whiteKeyWidth := width / numWhiteKeys
	blackKeyWidth := whiteKeyWidth * 0.6

	keys := make([]KeyRect, 0, numPitches)
	whiteIndex := 0
	for pitch := lowestPitch; pitch <= highestPitch; pitch++ {
		if isBlackKey(uint8(pitch)) {
			center := float64(whiteIndex) * whiteKeyWidth
			keys = append(keys, KeyRect{
				Pitch: uint8(pitch),
				X:     center - blackKeyWidth/2,
				W:     blackKeyWidth,
				Black: true,
			})
			continue
		}

		keys = append(keys, KeyRect{
			Pitch: uint8(pitch),
			X:     float64(whiteIndex) * whiteKeyWidth,
			W:     whiteKeyWidth,
			Black: false,
		})
		whiteIndex++
	}

	return keys
}

// keyRectForPitch looks up a pitch's geometry in a Keyboard() result,
// clamping out-of-range pitches to the nearest end of the keyboard.
func keyRectForPitch(keyboard []KeyRect, pitch uint8) KeyRect {
	idx := int(pitch) - lowestPitch
	if idx < 0 {
		idx = 0
	}
	if idx >= len(keyboard) {
		idx = len(keyboard) - 1
	}
	return keyboard[idx]
}
