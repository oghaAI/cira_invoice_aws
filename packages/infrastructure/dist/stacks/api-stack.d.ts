import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';
export interface ApiStackProps extends cdk.StackProps {
    config: EnvironmentConfig;
    database: any;
}
export declare class ApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ApiStackProps);
}
//# sourceMappingURL=api-stack.d.ts.map