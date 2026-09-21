package drawlist

import (
	"math"
	"testing"
)

const epsilon = 1e-9

func TestKeyboard_KeyCountsAndOrder(t *testing.T) {
	keys := Keyboard(880)

	if len(keys) != numPitches {
		t.Fatalf("len(keys) = %d, want %d", len(keys), numPitches)
	}
	if keys[0].Pitch != lowestPitch {
		t.Errorf("keys[0].Pitch = %d, want %d (A0)", keys[0].Pitch, lowestPitch)
	}
	if keys[len(keys)-1].Pitch != highestPitch {
		t.Errorf("last key Pitch = %d, want %d (C8)", keys[len(keys)-1].Pitch, highestPitch)
	}

	whiteCount, blackCount := 0, 0
	for _, k := range keys {
		if k.Black {
			blackCount++
		} else {
			whiteCount++
		}
	}
	if whiteCount != numWhiteKeys {
		t.Errorf("white key count = %d, want %d", whiteCount, numWhiteKeys)
	}
	if wantBlack := numPitches - numWhiteKeys; blackCount != wantBlack {
		t.Errorf("black key count = %d, want %d", blackCount, wantBlack)
	}
}

func TestKeyboard_WhiteKeysSpanFullWidthContiguously(t *testing.T) {
	const width = 880
	keys := Keyboard(width)

	var whiteEnd float64
	for _, k := range keys {
		if k.Black {
			continue
		}
		if math.Abs(k.X-whiteEnd) > epsilon {
			t.Fatalf("white key %d.X = %v, want %v (contiguous with previous white key)", k.Pitch, k.X, whiteEnd)
		}
		whiteEnd = k.X + k.W
	}
	if math.Abs(whiteEnd-width) > epsilon {
		t.Errorf("last white key ends at %v, want %v (full width)", whiteEnd, float64(width))
	}
}

func TestKeyboard_BlackKeyNarrowerAndBetweenWhites(t *testing.T) {
	keys := Keyboard(880)

	byPitch := make(map[uint8]KeyRect, len(keys))
	for _, k := range keys {
		byPitch[k.Pitch] = k
	}

	// C#1 (pitch 25) sits between C1 (24) and D1 (26).
	cSharp := byPitch[25]
	c := byPitch[24]
	d := byPitch[26]

	if !cSharp.Black {
		t.Fatalf("pitch 25 (C#1) not classified as black")
	}
	if cSharp.W >= c.W {
		t.Errorf("black key width %v should be narrower than white key width %v", cSharp.W, c.W)
	}
	center := cSharp.X + cSharp.W/2
	boundary := d.X // the shared edge between C1 and D1
	if math.Abs(center-boundary) > epsilon {
		t.Errorf("black key center = %v, want %v (boundary between C1 and D1)", center, boundary)
	}
}

func TestKeyRectForPitch_ClampsOutOfRange(t *testing.T) {
	keys := Keyboard(880)

	if got := keyRectForPitch(keys, 0); got != keys[0] {
		t.Errorf("keyRectForPitch(0) = %+v, want first key %+v", got, keys[0])
	}
	if got := keyRectForPitch(keys, 127); got != keys[len(keys)-1] {
		t.Errorf("keyRectForPitch(127) = %+v, want last key %+v", got, keys[len(keys)-1])
	}
}
