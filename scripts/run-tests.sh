#!/bin/bash

# CIRA Invoice AWS - Comprehensive Test Execution Script
# This script runs all tests with proper reporting and coverage

set -e  # Exit on any error

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

# Default values
RUN_UNIT=true
RUN_INTEGRATION=true
RUN_E2E=false
COVERAGE=true
WATCH=false
VERBOSE=false
PACKAGE=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --unit-only)
            RUN_INTEGRATION=false
            RUN_E2E=false
            shift
            ;;
        --integration-only)
            RUN_UNIT=false
            RUN_E2E=false
            shift
            ;;
        --e2e)
            RUN_E2E=true
            shift
            ;;
        --no-coverage)
            COVERAGE=false
            shift
            ;;
        --watch)
            WATCH=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --package)
            PACKAGE="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --unit-only      Run only unit tests"
            echo "  --integration-only Run only integration tests"
            echo "  --e2e           Include end-to-end tests"
            echo "  --no-coverage   Skip coverage reporting"
            echo "  --watch         Run tests in watch mode"
            echo "  --verbose       Enable verbose output"
            echo "  --package PKG   Run tests for specific package only"
            echo "  --help          Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                           # Run all tests with coverage"
            echo "  $0 --unit-only --watch      # Watch unit tests only"
            echo "  $0 --package api             # Test API package only"
            echo "  $0 --e2e --verbose          # Run all tests including E2E"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Function to check if package exists
check_package() {
    local pkg=$1
    if [ ! -d "packages/$pkg" ]; then
        print_error "Package 'packages/$pkg' does not exist"
        exit 1
    fi
}

# Function to run tests for a specific package
run_package_tests() {
    local pkg=$1
    local test_type=$2
    
    print_status "Running $test_type tests for package: $pkg"
    
    cd "packages/$pkg"
    
    local test_cmd="npm run test"
    
    if [ "$COVERAGE" = true ] && [ "$test_type" = "unit" ]; then
        test_cmd="npm run test:coverage"
    fi
    
    if [ "$WATCH" = true ]; then
        test_cmd="$test_cmd -- --watch"
    fi
    
    if [ "$VERBOSE" = true ]; then
        test_cmd="$test_cmd -- --verbose"
    fi
    
    if eval $test_cmd; then
        print_success "$test_type tests passed for $pkg ✓"
    else
        print_error "$test_type tests failed for $pkg ✗"
        return 1
    fi
    
    cd ../..
}

# Function to run all package tests
run_all_package_tests() {
    local test_type=$1
    local packages=()
    
    # Get list of packages
    for dir in packages/*/; do
        if [ -d "$dir" ]; then
            pkg=$(basename "$dir")
            if [ -f "packages/$pkg/package.json" ]; then
                packages+=("$pkg")
            fi
        fi
    done
    
    print_status "Found packages: ${packages[*]}"
    
    for pkg in "${packages[@]}"; do
        if ! run_package_tests "$pkg" "$test_type"; then
            return 1
        fi
    done
}

# Function to run root-level tests
run_root_tests() {
    local test_type=$1
    
    print_status "Running root-level $test_type tests"
    
    local test_cmd="npm run test"
    
    if [ "$COVERAGE" = true ] && [ "$test_type" = "unit" ]; then
        test_cmd="npm run test -- --coverage"
    fi
    
    if [ "$WATCH" = true ]; then
        test_cmd="$test_cmd -- --watch"
    fi
    
    if [ "$VERBOSE" = true ]; then
        test_cmd="$test_cmd -- --verbose"
    fi
    
    if eval $test_cmd; then
        print_success "Root-level $test_type tests passed ✓"
    else
        print_error "Root-level $test_type tests failed ✗"
        return 1
    fi
}

# Function to generate coverage report
generate_coverage_report() {
    if [ "$COVERAGE" = true ]; then
        print_status "Generating consolidated coverage report..."
        
        # Create coverage directory if it doesn't exist
        mkdir -p coverage
        
        # Merge coverage reports from all packages (if nyc is available)
        if command -v nyc &> /dev/null; then
            nyc merge packages/*/coverage coverage/merged.json
            nyc report --temp-dir coverage --report-dir coverage --reporter html --reporter text
            print_success "Coverage report generated in coverage/ ✓"
        else
            print_warning "nyc not found. Individual package coverage reports available in packages/*/coverage/"
        fi
    fi
}

# Function to run end-to-end tests
run_e2e_tests() {
    if [ "$RUN_E2E" = true ]; then
        print_status "Running end-to-end tests..."
        
        # Check if E2E test directory exists
        if [ -d "tests/e2e" ]; then
            cd tests/e2e
            
            local test_cmd="npm test"
            
            if [ "$VERBOSE" = true ]; then
                test_cmd="$test_cmd -- --verbose"
            fi
            
            if eval $test_cmd; then
                print_success "End-to-end tests passed ✓"
            else
                print_error "End-to-end tests failed ✗"
                return 1
            fi
            
            cd ../..
        else
            print_warning "No end-to-end tests found (tests/e2e directory missing)"
        fi
    fi
}

# Main execution
main() {
    echo "🧪 CIRA Invoice AWS - Test Execution"
    echo "===================================="
    
    local start_time=$(date +%s)
    local failed_tests=()
    
    # Check if specific package was requested
    if [ -n "$PACKAGE" ]; then
        check_package "$PACKAGE"
        print_status "Running tests for package: $PACKAGE"
        
        if [ "$RUN_UNIT" = true ]; then
            if ! run_package_tests "$PACKAGE" "unit"; then
                failed_tests+=("$PACKAGE unit tests")
            fi
        fi
        
        if [ "$RUN_INTEGRATION" = true ]; then
            if ! run_package_tests "$PACKAGE" "integration"; then
                failed_tests+=("$PACKAGE integration tests")
            fi
        fi
    else
        # Run tests for all packages
        print_status "Running tests for all packages..."
        
        # Pre-flight check: ensure all dependencies are installed
        print_status "Checking dependencies..."
        npm install --frozen-lockfile
        
        # Build all packages first
        print_status "Building all packages..."
        npm run build
        
        # Unit tests
        if [ "$RUN_UNIT" = true ]; then
            print_status "=== Running Unit Tests ==="
            if ! run_all_package_tests "unit"; then
                failed_tests+=("unit tests")
            fi
        fi
        
        # Integration tests
        if [ "$RUN_INTEGRATION" = true ]; then
            print_status "=== Running Integration Tests ==="
            if ! run_all_package_tests "integration"; then
                failed_tests+=("integration tests")
            fi
        fi
        
        # Root-level tests
        if ! run_root_tests "unit"; then
            failed_tests+=("root tests")
        fi
    fi
    
    # End-to-end tests
    if ! run_e2e_tests; then
        failed_tests+=("end-to-end tests")
    fi
    
    # Generate coverage report
    generate_coverage_report
    
    # Calculate execution time
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo "======================================"
    
    # Report results
    if [ ${#failed_tests[@]} -eq 0 ]; then
        print_success "🎉 All tests passed! (${duration}s)"
        
        if [ "$COVERAGE" = true ]; then
            echo ""
            print_status "Coverage reports available:"
            echo "  - Individual packages: packages/*/coverage/"
            echo "  - Consolidated: coverage/"
        fi
        
        exit 0
    else
        print_error "❌ Some tests failed (${duration}s):"
        for test in "${failed_tests[@]}"; do
            echo "  - $test"
        done
        
        exit 1
    fi
}

# Run main function
main "$@"