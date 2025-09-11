import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';
export interface DatabaseStackProps extends cdk.StackProps {
    config: EnvironmentConfig;
}
export declare class DatabaseStack extends cdk.Stack {
    readonly database: any;
    constructor(scope: Construct, id: string, props: DatabaseStackProps);
}
//# sourceMappingURL=database-stack.d.ts.map