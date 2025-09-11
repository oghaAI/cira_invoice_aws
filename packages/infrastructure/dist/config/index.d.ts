export interface EnvironmentConfig {
    environment: string;
    database: {
        instanceClass: string;
        allocatedStorage: number;
        multiAz: boolean;
        backupRetentionDays: number;
        deletionProtection: boolean;
    };
    api: {
        reservedConcurrency?: number;
        memorySize: number;
        timeout: number;
        logRetentionDays: number;
    };
    stepFunctions: {
        timeout: number;
        logLevel: string;
    };
    monitoring: {
        alertEmail?: string;
        createDashboard: boolean;
        detailedMonitoring: boolean;
    };
}
export declare function getConfig(environment: string): EnvironmentConfig;
//# sourceMappingURL=index.d.ts.map