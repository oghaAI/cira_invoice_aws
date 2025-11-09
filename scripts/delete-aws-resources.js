#!/usr/bin/env node

/**
 * Delete all AWS resources deployed by CIRA Invoice Processing
 * Deletes CloudFormation stacks and waits for completion
 */

const { execSync } = require('child_process');
const readline = require('readline');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
};

function execAwsCommand(command) {
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output);
  } catch (error) {
    console.error(`${colors.yellow}Warning: ${command} failed${colors.reset}`);
    return null;
  }
}

function printHeader(title) {
  const line = '━'.repeat(60);
  console.log(`\n${colors.cyan}${colors.bright}${title}${colors.reset}`);
  console.log(`${colors.cyan}${line}${colors.reset}\n`);
}

function printWarning(message) {
  console.log(`${colors.red}${colors.bright}⚠️  ${message}${colors.reset}`);
}

function printSuccess(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function printInfo(message) {
  console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
}

async function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${question} (yes/no): ${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

function deleteStack(stackName) {
  try {
    execSync(`aws cloudformation delete-stack --stack-name ${stackName}`, {
      encoding: 'utf8',
      stdio: 'inherit'
    });
    return true;
  } catch (error) {
    console.error(`${colors.red}Failed to delete ${stackName}${colors.reset}`);
    return false;
  }
}

function waitForStackDeletion(stackName) {
  printInfo(`Waiting for ${stackName} deletion to complete...`);
  try {
    execSync(`aws cloudformation wait stack-delete-complete --stack-name ${stackName}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 600000 // 10 minutes
    });
    printSuccess(`${stackName} deleted successfully`);
    return true;
  } catch (error) {
    console.error(`${colors.red}Timeout or error waiting for ${stackName} deletion${colors.reset}`);
    return false;
  }
}

async function main() {
  const env = process.argv[2] || 'dev';
  const dryRun = process.argv.includes('--dry-run');

  printHeader(`Delete CIRA AWS Resources (${env})`);

  // Get all stacks
  const stackPrefix = `CiraInvoice-`;
  const stackSuffix = `-${env}`;

  const stacksResult = execAwsCommand(
    `aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ROLLBACK_COMPLETE UPDATE_ROLLBACK_COMPLETE --query 'StackSummaries[?starts_with(StackName, \`${stackPrefix}\`) && contains(StackName, \`${stackSuffix}\`)].[StackName,StackStatus]' --output json`
  );

  if (!stacksResult || stacksResult.length === 0) {
    console.log(`${colors.yellow}No stacks found for environment: ${env}${colors.reset}`);
    return;
  }

  console.log(`${colors.bright}Found ${stacksResult.length} stack(s):${colors.reset}`);
  stacksResult.forEach(([name, status]) => {
    console.log(`  • ${name} (${status})`);
  });
  console.log();

  if (dryRun) {
    printInfo('DRY RUN - No resources will be deleted');
    return;
  }

  printWarning('This will DELETE ALL resources in these stacks!');
  printWarning('This action CANNOT be undone!');
  console.log();

  const confirmed = await confirm(`Delete ${stacksResult.length} stack(s) in ${env}?`);

  if (!confirmed) {
    console.log(`${colors.gray}Deletion cancelled${colors.reset}`);
    return;
  }

  console.log();
  printInfo('Starting deletion...');
  console.log();

  // Delete stacks sequentially
  const stackNames = stacksResult.map(([name]) => name);

  for (const stackName of stackNames) {
    console.log(`${colors.bright}Deleting ${stackName}...${colors.reset}`);

    if (deleteStack(stackName)) {
      waitForStackDeletion(stackName);
    }

    console.log();
  }

  printSuccess(`All stacks deleted from ${env} environment`);
}

main().catch(error => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
