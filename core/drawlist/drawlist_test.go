package drawlist

import (
	"reflect"
	"testing"

	"afterglow/core/midi"
	"afterglow/core/project"
	"afterglow/core/timeline"
)

const (
	testWidth  = 880.0
	testHeight = 1000.0
)

func testProject() *project.Project {
	p := project.New("song.mid")
	p.Tracks = []project.TrackSettings{
		{Track: 1, Hidden: true},
	}
	return p
}

func TestDrawList_EmptyWhenNoNotes(t *testing.T) {
	tl := timeline.New(testProject(), nil)
	if got := DrawList(tl, 0, testWidth, testHeight); got != nil {
		t.Errorf("DrawList() = %v, want nil", got)
	}
}

func TestDrawList_NoteReachesHitLineAtStart(t *testing.T) {
	p := testProject()
	notes := []midi.Note{{Start: 5, Duration: 1, Pitch: 21, Velocity: 127, Track: 0}} // A0: the first (white) key
	tl := timeline.New(p, notes)

	instances := DrawList(tl, 5, testWidth, testHeight) // t == note start
	if len(instances) != 1 {
		t.Fatalf("len(instances) = %d, want 1", len(instances))
	}

	hitLineY := testHeight * HitLineFraction
	scrollSpeed := hitLineY / LookaheadSeconds
	wantH := 1.0 * scrollSpeed
	got := instances[0]

	if got.Y+got.H != hitLineY {
		t.Errorf("bottom edge = %v, want %v (hit line)", got.Y+got.H, hitLineY)
	}
	if got.H != wantH {
		t.Errorf("H = %v, want %v", got.H, wantH)
	}
	if got.X != 0 {
		t.Errorf("X = %v, want 0 (A0 is the first white key)", got.X)
	}
	if got.Glow != 1.0 {
		t.Errorf("Glow = %v, want 1.0 (velocity 127)", got.Glow)
	}
}

func TestDrawList_NotYetVisible(t *testing.T) {
	p := testProject()
	// lookahead is always exactly LookaheadSeconds, regardless of resolution.
	notes := []midi.Note{{Start: 100, Duration: 1, Pitch: 60, Velocity: 100, Track: 0}}
	tl := timeline.New(p, notes)

	if got := DrawList(tl, 0, testWidth, testHeight); len(got) != 0 {
		t.Errorf("DrawList() = %v, want empty (note starts far in the future)", got)
	}
}

func TestDrawList_AlreadyScrolledPast(t *testing.T) {
	p := testProject()
	notes := []midi.Note{{Start: 0, Duration: 0.1, Pitch: 60, Velocity: 100, Track: 0}}
	tl := timeline.New(p, notes)

	if got := DrawList(tl, 1000, testWidth, testHeight); len(got) != 0 {
		t.Errorf("DrawList() = %v, want empty (note long finished)", got)
	}
}

func TestDrawList_HiddenTrackExcluded(t *testing.T) {
	p := testProject()
	notes := []midi.Note{{Start: 5, Duration: 1, Pitch: 60, Velocity: 100, Track: 1}} // track 1 is hidden
	tl := timeline.New(p, notes)

	if got := DrawList(tl, 5, testWidth, testHeight); len(got) != 0 {
		t.Errorf("DrawList() = %v, want empty (hidden track)", got)
	}
}

func TestDrawList_PitchOutOfRangeIsClamped(t *testing.T) {
	p := testProject()
	notes := []midi.Note{{Start: 5, Duration: 1, Pitch: 127, Velocity: 100, Track: 0}}
	tl := timeline.New(p, notes)

	instances := DrawList(tl, 5, testWidth, testHeight)
	if len(instances) != 1 {
		t.Fatalf("len(instances) = %d, want 1", len(instances))
	}

	keyboard := Keyboard(testWidth)
	topKey := keyboard[len(keyboard)-1] // C8, the highest key on an 88-key piano
	if instances[0].X != topKey.X || instances[0].W != topKey.W {
		t.Errorf("X,W = %v,%v, want %v,%v (clamped to top key C8)", instances[0].X, instances[0].W, topKey.X, topKey.W)
	}
}

// TestDrawList_MatchesBruteForce checks the binary-search-bounded result
// against a full-scan reimplementation of the same visibility rule, across
// a mix of short and long notes and several sample times.
func TestDrawList_MatchesBruteForce(t *testing.T) {
	p := testProject()
	notes := []midi.Note{
		{Start: 0, Duration: 0.5, Pitch: 21, Velocity: 60, Track: 0},
		{Start: 1, Duration: 4, Pitch: 30, Velocity: 80, Track: 0}, // long note
		{Start: 2, Duration: 0.2, Pitch: 40, Velocity: 100, Track: 0},
		{Start: 2, Duration: 0.2, Pitch: 41, Velocity: 100, Track: 1}, // hidden
		{Start: 10, Duration: 1, Pitch: 60, Velocity: 127, Track: 0},
		{Start: 50, Duration: 0.3, Pitch: 90, Velocity: 40, Track: 0},
	}
	tl := timeline.New(p, notes)

	for _, sample := range []float64{-5, 0, 1, 2, 3, 5, 9, 10, 10.5, 20, 50, 60} {
		got := DrawList(tl, sample, testWidth, testHeight)
		want := bruteForceDrawList(tl, sample, testWidth, testHeight)
		if !reflect.DeepEqual(got, want) {
			t.Errorf("t=%v: DrawList() = %+v, want %+v (brute force)", sample, got, want)
		}
	}
}

// bruteForceDrawList reimplements DrawList's visibility rule with a full
// scan over every note, as an independent check on the binary-search
// bounds used by the real implementation.
func bruteForceDrawList(tl *timeline.Timeline, t, width, height float64) []Instance {
	p := tl.Project
	hitLineY := height * HitLineFraction
	scrollSpeed := hitLineY / LookaheadSeconds
	lookaheadUp := LookaheadSeconds
	trailingWindow := (height - hitLineY) / scrollSpeed
	keyboard := Keyboard(width)

	var instances []Instance
	for _, n := range tl.Notes {
		if n.Start+n.Duration < t-trailingWindow {
			continue
		}
		if n.Start > t+lookaheadUp {
			continue
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
