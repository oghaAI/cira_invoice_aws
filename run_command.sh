#!/bin/bash

# Script to handle commands with special characters that cause zsh issues
# This script disables history expansion to prevent "event not found" errors

# Set options to handle special characters properly
set +H  # Disable history expansion

# Your command here - replace this with your actual command
# Example: if your command was something like "command -option !special"
# you would put it here properly escaped

echo "Running command with proper handling..."

# If you need to pass the command as an argument to this script:
# "$@" will pass all arguments to the command
if [ $# -gt 0 ]; then
    echo "Executing: $@"
    eval "$@"
else
    echo "Usage: $0 <your-command>"
    echo "Example: $0 'your-command --option !special'"
fi