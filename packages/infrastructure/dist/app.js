#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const api_stack_1 = require("./stacks/api-stack");
const database_stack_1 = require("./stacks/database-stack");
const workflow_stack_1 = require("./stacks/workflow-stack");
const monitoring_stack_1 = require("./stacks/monitoring-stack");
const config_1 = require("./config");
const app = new cdk.App();
const environment = app.node.tryGetContext('environment') || 'dev';
const config = (0, config_1.getConfig)(environment);
const baseProps = {
    tags: {
        Environment: environment,
        Project: 'cira-invoice-aws',
        ManagedBy: 'cdk'
    }
};
const envConfig = process.env['CDK_DEFAULT_ACCOUNT'] ? {
    env: {
        account: process.env['CDK_DEFAULT_ACCOUNT'],
        region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1'
    }
} : {};
const stackProps = {
    ...baseProps,
    ...envConfig
};
const databaseStack = new database_stack_1.DatabaseStack(app, `CiraInvoice-Database-${environment}`, {
    ...stackProps,
    config
});
const apiStack = new api_stack_1.ApiStack(app, `CiraInvoice-Api-${environment}`, {
    ...stackProps,
    config,
    database: databaseStack.database
});
const workflowStack = new workflow_stack_1.WorkflowStack(app, `CiraInvoice-Workflow-${environment}`, {
    ...stackProps,
    config,
    database: databaseStack.database
});
const monitoringStack = new monitoring_stack_1.MonitoringStack(app, `CiraInvoice-Monitoring-${environment}`, {
    ...stackProps,
    config,
    apiStack,
    databaseStack,
    workflowStack
});
apiStack.addDependency(databaseStack);
workflowStack.addDependency(databaseStack);
monitoringStack.addDependency(apiStack);
monitoringStack.addDependency(workflowStack);
//# sourceMappingURL=app.js.map