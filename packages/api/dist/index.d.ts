export declare const API_VERSION = "1.0.0";
export interface ApiInfo {
    name: string;
    version: string;
    status: 'healthy' | 'degraded' | 'down';
}
export declare function getApiInfo(): ApiInfo;
//# sourceMappingURL=index.d.ts.map