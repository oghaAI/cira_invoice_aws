#!/bin/bash

# CIRA Invoice AWS - Development Environment Setup Script
# This script sets up the local development environment

set -e  # Exit on any error

echo "🚀 Setting up CIRA Invoice AWS development environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js >= 20.17.0"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    REQUIRED_VERSION="20.17.0"
    
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
        print_error "Node.js version $NODE_VERSION is too old. Please upgrade to >= $REQUIRED_VERSION"
        exit 1
    fi
    
    print_success "Node.js version $NODE_VERSION ✓"
    
    # Check npm version
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    NPM_VERSION=$(npm -v)
    print_success "npm version $NPM_VERSION ✓"
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_warning "AWS CLI is not installed. Install it for deployment capabilities"
    else
        AWS_VERSION=$(aws --version 2>&1 | cut -d' ' -f1 | cut -d'/' -f2)
        print_success "AWS CLI version $AWS_VERSION ✓"
    fi
    
    # Check CDK
    if ! command -v cdk &> /dev/null; then
        print_warning "AWS CDK is not installed globally. Will install with project dependencies"
    else
        CDK_VERSION=$(cdk --version 2>&1 | cut -d' ' -f1)
        print_success "AWS CDK version $CDK_VERSION ✓"
    fi
}

# Install dependencies
install_dependencies() {
    print_status "Installing project dependencies..."
    
    # Clean install
    if [ -f "package-lock.json" ]; then
        print_status "Cleaning existing dependencies..."
        rm -rf node_modules package-lock.json
    fi
    
    npm install
    print_success "Dependencies installed ✓"
}

# Build all packages
build_packages() {
    print_status "Building all packages..."
    npm run build
    print_success "All packages built ✓"
}

# Run linting
run_linting() {
    print_status "Running linting checks..."
    npm run lint
    print_success "Linting passed ✓"
}

# Run tests
run_tests() {
    print_status "Running test suite..."
    npm run test
    print_success "All tests passed ✓"
}

# Setup environment files
setup_environment() {
    print_status "Setting up environment configuration..."
    
    # Create .env.local if it doesn't exist
    if [ ! -f ".env.local" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env.local
            print_success "Created .env.local from template"
            print_warning "Please edit .env.local with your specific configuration"
        else
            print_warning "No .env.example found. Create .env.local manually if needed"
        fi
    else
        print_success "Environment file .env.local already exists ✓"
    fi
}

# Setup Git hooks (if using husky)
setup_git_hooks() {
    print_status "Setting up Git hooks..."
    
    if [ -d ".git" ]; then
        # Check if husky is installed
        if npm list husky > /dev/null 2>&1; then
            npx husky install
            print_success "Git hooks configured ✓"
        else
            print_warning "Husky not found in dependencies. Skipping Git hooks setup"
        fi
    else
        print_warning "Not a Git repository. Skipping Git hooks setup"
    fi
}

# Create local database (if Docker is available)
setup_local_database() {
    print_status "Setting up local database..."
    
    if command -v docker &> /dev/null; then
        # Check if container already exists
        if [ "$(docker ps -a -q -f name=cira-postgres)" ]; then
            print_status "PostgreSQL container already exists"
            
            # Start it if not running
            if [ ! "$(docker ps -q -f name=cira-postgres)" ]; then
                docker start cira-postgres
                print_success "Started existing PostgreSQL container ✓"
            else
                print_success "PostgreSQL container already running ✓"
            fi
        else
            # Create new container
            docker run --name cira-postgres \
                -e POSTGRES_PASSWORD=password \
                -e POSTGRES_DB=cira_invoice \
                -e POSTGRES_USER=postgres \
                -p 5432:5432 \
                -d postgres:16
            
            print_success "Created and started PostgreSQL container ✓"
        fi
        
        # Wait for database to be ready
        print_status "Waiting for database to be ready..."
        sleep 3
        
        # Run migrations if database package exists
        if [ -d "packages/database" ]; then
            cd packages/database
            if npm run db:migrate > /dev/null 2>&1; then
                print_success "Database migrations applied ✓"
            else
                print_warning "Database migrations failed or not configured yet"
            fi
            cd ../..
        fi
    else
        print_warning "Docker not found. Skipping local database setup"
        print_warning "Install Docker and run: docker run --name cira-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=cira_invoice -p 5432:5432 -d postgres:16"
    fi
}

# Main execution
main() {
    echo "🏗️  CIRA Invoice AWS - Development Setup"
    echo "======================================"
    
    check_prerequisites
    echo ""
    
    install_dependencies
    echo ""
    
    setup_environment
    echo ""
    
    build_packages
    echo ""
    
    run_linting
    echo ""
    
    run_tests
    echo ""
    
    setup_git_hooks
    echo ""
    
    setup_local_database
    echo ""
    
    print_success "🎉 Development environment setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Edit .env.local with your configuration"
    echo "  2. Configure AWS credentials: aws configure"
    echo "  3. Start development: npm run dev"
    echo "  4. View documentation: open docs/README.md"
    echo ""
    echo "Happy coding! 🚀"
}

# Run main function
main "$@"