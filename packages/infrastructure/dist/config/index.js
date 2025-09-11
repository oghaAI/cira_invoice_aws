"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = getConfig;
function getConfig(environment) {
    switch (environment) {
        case 'dev':
            return {
                environment: 'dev',
                database: {
                    instanceClass: 'db.t3.micro',
                    allocatedStorage: 20,
                    multiAz: false,
                    backupRetentionDays: 7,
                    deletionProtection: false
                },
                api: {
                    memorySize: 512,
                    timeout: 30,
                    logRetentionDays: 7
                },
                stepFunctions: {
                    timeout: 300,
                    logLevel: 'ALL'
                },
                monitoring: {
                    createDashboard: true,
                    detailedMonitoring: true
                }
            };
        case 'staging':
            return {
                environment: 'staging',
                database: {
                    instanceClass: 'db.t3.small',
                    allocatedStorage: 50,
                    multiAz: false,
                    backupRetentionDays: 14,
                    deletionProtection: true
                },
                api: {
                    reservedConcurrency: 50,
                    memorySize: 1024,
                    timeout: 60,
                    logRetentionDays: 30
                },
                stepFunctions: {
                    timeout: 600,
                    logLevel: 'ERROR'
                },
                monitoring: {
                    createDashboard: true,
                    detailedMonitoring: true
                }
            };
        case 'prod':
            return {
                environment: 'prod',
                database: {
                    instanceClass: 'db.r5.large',
                    allocatedStorage: 100,
                    multiAz: true,
                    backupRetentionDays: 30,
                    deletionProtection: true
                },
                api: {
                    reservedConcurrency: 100,
                    memorySize: 2048,
                    timeout: 120,
                    logRetentionDays: 90
                },
                stepFunctions: {
                    timeout: 900,
                    logLevel: 'ERROR'
                },
                monitoring: {
                    createDashboard: true,
                    detailedMonitoring: true
                }
            };
        default:
            throw new Error(`Unknown environment: ${environment}`);
    }
}
//# sourceMappingURL=index.js.map