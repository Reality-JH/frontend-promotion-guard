export declare function exists(path: string): Promise<boolean>;
export declare function ensureDir(path: string): Promise<void>;
export declare function slug(value: string): string;
export declare function redact(value: string): string;
export declare function run(command: string, args: string[], cwd?: string): Promise<string>;
export declare function pruneRuns(evidenceDir: string, retention: number): Promise<void>;
export declare function resolveInside(root: string, path: string): string;
export declare function fileName(path: string): string;
