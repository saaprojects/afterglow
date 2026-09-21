export namespace drawlist {
	
	export class Instance {
	    X: number;
	    Y: number;
	    W: number;
	    H: number;
	    Color: string;
	    GlowColor: string;
	    GlowEnabled: boolean;
	    Glow: number;
	    Pitch: number;
	
	    static createFrom(source: any = {}) {
	        return new Instance(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.X = source["X"];
	        this.Y = source["Y"];
	        this.W = source["W"];
	        this.H = source["H"];
	        this.Color = source["Color"];
	        this.GlowColor = source["GlowColor"];
	        this.GlowEnabled = source["GlowEnabled"];
	        this.Glow = source["Glow"];
	        this.Pitch = source["Pitch"];
	    }
	}
	export class KeyRect {
	    Pitch: number;
	    X: number;
	    W: number;
	    Black: boolean;
	
	    static createFrom(source: any = {}) {
	        return new KeyRect(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Pitch = source["Pitch"];
	        this.X = source["X"];
	        this.W = source["W"];
	        this.Black = source["Black"];
	    }
	}

}

export namespace main {
	
	export class NewProjectSettings {
	    midiFile: string;
	    audioFile: string;
	
	    static createFrom(source: any = {}) {
	        return new NewProjectSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.midiFile = source["midiFile"];
	        this.audioFile = source["audioFile"];
	    }
	}
	export class ProjectInfo {
	    durationSeconds: number;
	    fps: number;
	    hasAudio: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ProjectInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.durationSeconds = source["durationSeconds"];
	        this.fps = source["fps"];
	        this.hasAudio = source["hasAudio"];
	    }
	}
	export class OpenProjectResult {
	    path: string;
	    info: ProjectInfo;
	
	    static createFrom(source: any = {}) {
	        return new OpenProjectResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.info = this.convertValues(source["info"], ProjectInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class TrackInfo {
	    track: number;
	    noteCount: number;
	    color: string;
	    glowColor: string;
	    glowDisabled: boolean;
	    hidden: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TrackInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.track = source["track"];
	        this.noteCount = source["noteCount"];
	        this.color = source["color"];
	        this.glowColor = source["glowColor"];
	        this.glowDisabled = source["glowDisabled"];
	        this.hidden = source["hidden"];
	    }
	}

}

