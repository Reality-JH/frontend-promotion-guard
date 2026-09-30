export type RouteConfig = {
    name: string;
    path: string;
    readySelector: string;
};
export type ViewportConfig = {
    width: number;
    height: number;
};
export type StyleAssertion = {
    selector: string;
    property: string;
    equals?: string;
    notEquals?: string;
};
export type RemoteSyncCommand = {
    command: string;
    args: string[];
};
export type DockerConfig = {
    candidateImage: string;
    productionImage: string;
    candidatePort: number;
    productionPort: number;
    containerPort: number;
    candidateContainer: string;
    productionContainer: string;
    buildContext?: string;
    dockerfile?: string;
    candidateArgs: string[];
    productionArgs: string[];
    healthPath: string;
    rollback: boolean;
    requireImmutableImage: boolean;
};
export type FpgConfig = {
    configPath: string;
    rootDir: string;
    baseUrl: string;
    browserPath?: string;
    routes: RouteConfig[];
    viewports: ViewportConfig[];
    cssAudit: {
        files: string[];
        forbiddenTokens: string[];
        requiredSelectors: string[];
    };
    computedStyles: StyleAssertion[];
    visual: {
        maxDiffPixelRatio: number;
        pixelThreshold: number;
        baselineDir: string;
        evidenceDir: string;
        retention: number;
        remoteSync?: {
            pull?: RemoteSyncCommand;
            push?: RemoteSyncCommand;
        };
    };
    docker?: DockerConfig;
};
export type CheckResult = {
    name: string;
    status: "passed" | "failed";
    detail: string;
};
export type VisualResult = {
    route: string;
    viewport: string;
    baseline: string;
    current: string;
    diff: string;
    diffPixelRatio: number;
    status: "passed" | "failed";
};
export type RunRecord = {
    startedAt: string;
    finishedAt?: string;
    command: string;
    baseUrl: string;
    commit: string;
    candidateImage?: string;
    candidateImageId?: string;
    productionImage?: string;
    previousProductionImageId?: string;
    finalProductionImageId?: string;
    rollbackImage?: string;
    rolledBack?: boolean;
    finalState?: "promoted" | "restored" | "failed";
    environment?: {
        platform: string;
        node: string;
        browser?: string;
    };
    configSummary?: {
        routes: string[];
        viewports: string[];
        maxDiffPixelRatio: number;
        pixelThreshold: number;
    };
    stages?: Array<{
        name: "candidate" | "production" | "rollback";
        status: "running" | "passed" | "failed";
        startedAt: string;
        finishedAt?: string;
    }>;
    checks: CheckResult[];
    visuals: VisualResult[];
};
