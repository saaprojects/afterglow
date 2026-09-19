export namespace drawlist {
	
	export class Instance {
	    X: number;
	    Y: number;
	    W: number;
	    H: number;
	    Color: string;
	    Glow: number;
	
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
	        this.Glow = source["Glow"];
	    }
	}

}

export namespace main {
	
	export class ProjectInfo {
	    durationSeconds: number;
	    width: number;
	    height: number;
	    fps: number;
	
	    static createFrom(source: any = {}) {
	        return new ProjectInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.durationSeconds = source["durationSeconds"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.fps = source["fps"];
	    }
	}

}

