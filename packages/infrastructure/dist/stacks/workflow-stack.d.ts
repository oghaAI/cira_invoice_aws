import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';
export interface WorkflowStackProps extends cdk.StackProps {
    config: EnvironmentConfig;
    database: any;
}
export declare class WorkflowStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: WorkflowStackProps);
}
//# sourceMappingURL=workflow-stack.d.ts.map