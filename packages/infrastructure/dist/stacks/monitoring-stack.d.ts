import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';
export interface MonitoringStackProps extends cdk.StackProps {
    config: EnvironmentConfig;
    apiStack: any;
    databaseStack: any;
    workflowStack: any;
}
export declare class MonitoringStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: MonitoringStackProps);
}
//# sourceMappingURL=monitoring-stack.d.ts.map