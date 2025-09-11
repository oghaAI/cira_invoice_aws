export declare const PROJECT_NAME = "cira-invoice-aws";
export declare const VERSION = "1.0.0";
export interface ProjectInfo {
    name: string;
    version: string;
    environment: 'dev' | 'staging' | 'prod';
}
export declare function getProjectInfo(environment?: 'dev' | 'staging' | 'prod'): ProjectInfo;
//# sourceMappingURL=index.d.ts.map