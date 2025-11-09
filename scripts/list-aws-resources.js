#!/usr/bin/env node

/**
 * List all AWS resources deployed by CIRA Invoice Processing
 * Displays beautiful formatted output with colors and tables
 */

const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

// Icons
const icons = {
  stack: '📦',
  lambda: '🔧',
  database: '🗄️',
  stepFunction: '⚡',
  api: '🌐',
  monitoring: '📊',
  vpc: '🔒',
  summary: '📈',
};

function execAwsCommand(command) {
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output);
  } catch (error) {
    console.error(`${colors.yellow}Warning: Failed to execute: ${command}${colors.reset}`);
    return null;
  }
}

function printHeader(title, icon = '') {
  const line = '━'.repeat(60);
  console.log(`\n${colors.cyan}${colors.bright}${icon} ${title}${colors.reset}`);
  console.log(`${colors.cyan}${line}${colors.reset}\n`);
}

function printSection(title, icon = '') {
  console.log(`\n${colors.bright}${icon} ${title}${colors.reset}`);
}

function printTable(headers, rows, colWidths = null) {
  if (!colWidths) {
    colWidths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(r => String(r[i] || '').length))
    );
  }

  // Top border
  const topBorder = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  console.log(topBorder);

  // Headers
  const headerRow = '│' + headers.map((h, i) =>
    ` ${h.padEnd(colWidths[i])} `
  ).join('│') + '│';
  console.log(colors.bright + headerRow + colors.reset);

  // Header separator
  const separator = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  console.log(separator);

  // Rows
  rows.forEach((row, idx) => {
    const dataRow = '│' + row.map((cell, i) =>
      ` ${String(cell || '').padEnd(colWidths[i])} `
    ).join('│') + '│';
    console.log(dataRow);
  });

  // Bottom border
  const bottomBorder = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';
  console.log(bottomBorder);
}

function getStackResources(stackName) {
  const result = execAwsCommand(
    `aws cloudformation describe-stack-resources --stack-name ${stackName} --query 'StackResources[*].[LogicalResourceId,ResourceType,ResourceStatus,PhysicalResourceId]' --output json`
  );
  return result || [];
}

function getStackOutputs(stackName) {
  const result = execAwsCommand(
    `aws cloudformation describe-stacks --stack-name ${stackName} --query 'Stacks[0].Outputs' --output json`
  );
  return result || [];
}

function getLambdaDetails(functionName) {
  const result = execAwsCommand(
    `aws lambda get-function --function-name ${functionName} --query '{Runtime:Configuration.Runtime,Memory:Configuration.MemorySize,Timeout:Configuration.Timeout,LastModified:Configuration.LastModified}' --output json`
  );
  return result || {};
}

function getRdsDetails(dbIdentifier) {
  const result = execAwsCommand(
    `aws rds describe-db-instances --db-instance-identifier ${dbIdentifier} --query 'DBInstances[0].{Engine:Engine,EngineVersion:EngineVersion,Status:DBInstanceStatus,Endpoint:Endpoint.Address,Port:Endpoint.Port}' --output json`
  );
  return result || {};
}

function main() {
  const env = process.argv[2] || 'dev';

  printHeader(`CIRA Invoice Processing - AWS Resources (${env})`, '🚀');

  // Get all stacks
  const stackPrefix = `CiraInvoice-`;
  const stackSuffix = `-${env}`;

  const stacksResult = execAwsCommand(
    `aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[?starts_with(StackName, \`${stackPrefix}\`) && contains(StackName, \`${stackSuffix}\`)].[StackName,StackStatus,CreationTime]' --output json`
  );

  if (!stacksResult || stacksResult.length === 0) {
    console.log(`${colors.yellow}No stacks found for environment: ${env}${colors.reset}`);
    return;
  }

  // Print stacks overview
  printSection('CloudFormation Stacks', icons.stack);
  const stackRows = stacksResult.map(([name, status, created]) => [
    name,
    status,
    new Date(created).toLocaleDateString()
  ]);
  printTable(['Stack Name', 'Status', 'Created'], stackRows);

  // Collect all resources by type
  const lambdaFunctions = [];
  const databases = [];
  const stateMachines = [];
  const apiGateways = [];
  const allOutputs = [];

  stacksResult.forEach(([stackName]) => {
    const resources = getStackResources(stackName);
    const outputs = getStackOutputs(stackName);

    allOutputs.push({ stackName, outputs });

    resources.forEach(([logicalId, resourceType, status, physicalId]) => {
      switch (resourceType) {
        case 'AWS::Lambda::Function':
          lambdaFunctions.push({ logicalId, physicalId, stackName });
          break;
        case 'AWS::RDS::DBInstance':
          databases.push({ logicalId, physicalId, stackName });
          break;
        case 'AWS::StepFunctions::StateMachine':
          stateMachines.push({ logicalId, physicalId, stackName });
          break;
        case 'AWS::ApiGateway::RestApi':
        case 'AWS::ApiGatewayV2::Api':
          apiGateways.push({ logicalId, physicalId, stackName });
          break;
      }
    });
  });

  // Lambda Functions
  if (lambdaFunctions.length > 0) {
    printSection(`Lambda Functions (${lambdaFunctions.length})`, icons.lambda);
    const lambdaRows = lambdaFunctions.map(({ logicalId, physicalId }) => {
      const details = getLambdaDetails(physicalId);
      return [
        logicalId,
        details.Runtime || 'N/A',
        `${details.Memory || 'N/A'} MB`,
        `${details.Timeout || 'N/A'}s`
      ];
    });
    printTable(['Function Name', 'Runtime', 'Memory', 'Timeout'], lambdaRows);
  }

  // RDS Databases
  if (databases.length > 0) {
    printSection(`RDS Databases (${databases.length})`, icons.database);
    databases.forEach(({ logicalId, physicalId }) => {
      const details = getRdsDetails(physicalId);
      console.log(`\n  ${colors.bright}${logicalId}${colors.reset}`);
      console.log(`    Endpoint: ${colors.green}${details.Endpoint || 'N/A'}:${details.Port || ''}${colors.reset}`);
      console.log(`    Engine:   ${details.Engine || 'N/A'} ${details.EngineVersion || ''}`);
      console.log(`    Status:   ${details.Status || 'N/A'}`);
    });
  }

  // Step Functions
  if (stateMachines.length > 0) {
    printSection(`Step Functions (${stateMachines.length})`, icons.stepFunction);
    const smRows = stateMachines.map(({ logicalId, physicalId }) => {
      const name = physicalId.split(':').pop();
      return [logicalId, name];
    });
    printTable(['Logical ID', 'State Machine Name'], smRows);
  }

  // API Endpoints
  printSection('API Endpoints', icons.api);
  const apiEndpoints = [];
  allOutputs.forEach(({ stackName, outputs }) => {
    outputs.forEach(output => {
      if (output.OutputKey && (
        output.OutputKey.includes('ApiEndpoint') ||
        output.OutputKey.includes('Endpoint') && output.OutputValue.includes('http')
      )) {
        apiEndpoints.push([output.Description || output.OutputKey, output.OutputValue]);
      }
    });
  });

  if (apiEndpoints.length > 0) {
    apiEndpoints.forEach(([desc, url]) => {
      console.log(`  ${colors.bright}${desc}${colors.reset}`);
      console.log(`    ${colors.green}${url}${colors.reset}`);
    });
  } else {
    console.log(`  ${colors.gray}No API endpoints found${colors.reset}`);
  }

  // Important Outputs
  printSection('Key Resources', icons.monitoring);
  allOutputs.forEach(({ stackName, outputs }) => {
    const important = outputs.filter(o =>
      o.OutputKey.includes('Arn') ||
      o.OutputKey.includes('StateMachine') ||
      o.OutputKey.includes('Dashboard')
    );

    if (important.length > 0) {
      console.log(`\n  ${colors.bright}${stackName}${colors.reset}`);
      important.forEach(output => {
        const key = output.Description || output.OutputKey;
        const value = output.OutputValue;
        // Truncate long ARNs
        const displayValue = value.length > 80 ? value.substring(0, 77) + '...' : value;
        console.log(`    ${colors.gray}${key}:${colors.reset}`);
        console.log(`      ${displayValue}`);
      });
    }
  });

  // Summary
  const totalResources = lambdaFunctions.length + databases.length + stateMachines.length + apiGateways.length;
  printSection('Summary', icons.summary);
  console.log(`  ${colors.bright}${totalResources}${colors.reset} resources across ${colors.bright}${stacksResult.length}${colors.reset} stacks`);
  console.log(`  ${icons.lambda} ${lambdaFunctions.length} Lambda Functions`);
  console.log(`  ${icons.database} ${databases.length} RDS Databases`);
  console.log(`  ${icons.stepFunction} ${stateMachines.length} Step Functions`);
  console.log(`  ${icons.api} ${apiGateways.length} API Gateways`);
  console.log();
}

main();
