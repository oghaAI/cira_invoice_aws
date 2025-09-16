#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Generate HTML documentation using Scalar
function generateScalarDocs() {
  const specPath = path.join(__dirname, 'api-spec.yaml');
  const outputPath = path.join(__dirname, 'api-docs.html');
  
  // Read the OpenAPI spec
  const apiSpec = fs.readFileSync(specPath, 'utf8');
  
  // Generate HTML with Scalar
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>CIRA Invoice Processing API</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; }
  </style>
</head>
<body>
  <script
    id="api-reference"
    type="application/json"
    data-url="./api-spec.yaml">
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
  console.log('✅ Generated Scalar documentation at:', outputPath);
}

// Generate JSON version of the spec for easier consumption
function generateJsonSpec() {
  const yamlPath = path.join(__dirname, 'api-spec.yaml');
  const jsonPath = path.join(__dirname, 'api-spec.json');
  
  // Simple YAML to JSON conversion for basic cases
  // For production, consider using js-yaml library
  try {
    const yaml = require('js-yaml');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    const jsonContent = yaml.load(yamlContent);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2));
    console.log('✅ Generated JSON spec at:', jsonPath);
  } catch (error) {
    console.log('⚠️  js-yaml not available, skipping JSON generation');
    console.log('   Install with: npm install --save-dev js-yaml');
  }
}

// Main execution
console.log('🚀 Generating API documentation...');
generateScalarDocs();
generateJsonSpec();
console.log('✨ Documentation generation complete!');
console.log('');
console.log('📖 Open docs/api-docs.html in your browser to view the documentation');
console.log('📋 Or serve it with: npx serve docs/');
