package midi

import (
	"math"
	"testing"
)

const grandPianoFixture = "../../testdata/grand-piano.mid"

func TestLoad_GrandPiano(t *testing.T) {
	notes, err := Load(grandPianoFixture)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if len(notes) != 300 {
		t.Fatalf("len(notes) = %d, want 300", len(notes))
	}

	first := notes[0]
	wantFirst := Note{Start: 0.6836, Duration: 2.9785, Pitch: 51, Velocity: 80, Track: 2}
	if !notesApproxEqual(first, wantFirst) {
		t.Errorf("first note = %+v, want approximately %+v", first, wantFirst)
	}

	last := notes[len(notes)-1]
	wantLast := Note{Start: 31.1133, Duration: 0.0586, Pitch: 73, Velocity: 84, Track: 2}
	if !notesApproxEqual(last, wantLast) {
		t.Errorf("last note = %+v, want approximately %+v", last, wantLast)
	}
}

// TestLoad_NotesSortedAndValid guards against regressions in note-on/note-off
// pairing across irregular, real-world delta timing: every note must have a
// positive duration, an in-range pitch/velocity, and the overall list must
// be sorted by start time.
func TestLoad_NotesSortedAndValid(t *testing.T) {
	notes, err := Load(grandPianoFixture)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	for i, n := range notes {
		if n.Duration <= 0 {
			t.Errorf("notes[%d] has non-positive duration: %+v", i, n)
		}
		if n.Pitch > 127 {
			t.Errorf("notes[%d] has out-of-range pitch: %+v", i, n)
		}
		if n.Velocity == 0 || n.Velocity > 127 {
			t.Errorf("notes[%d] has invalid velocity: %+v", i, n)
		}
		if i > 0 && n.Start < notes[i-1].Start {
			t.Errorf("notes[%d].Start = %v is before notes[%d].Start = %v; list not sorted", i, n.Start, i-1, notes[i-1].Start)
		}
	}
}

func TestLoad_MissingFile(t *testing.T) {
	if _, err := Load("../../testdata/does-not-exist.mid"); err == nil {
		t.Fatal("Load() with missing file: want error, got nil")
	}
}

func notesApproxEqual(got, want Note) bool {
	const epsilon = 0.001
	return math.Abs(got.Start-want.Start) < epsilon &&
		math.Abs(got.Duration-want.Duration) < epsilon &&
		got.Pitch == want.Pitch &&
		got.Velocity == want.Velocity &&
		got.Track == want.Track
}
