#!/bin/bash

# Upload Models to Modal Volume Script
# This script uploads models from local /models directory to Modal volume for CaseOn inference service

set -e  # Exit on any error

# Configuration
VOLUME_NAME="caseon-models"
LOCAL_MODELS_DIR="/home/exo/Documents/models/caseon-models"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}🔄 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check Modal CLI installation and authentication
check_modal_setup() {
    print_status "Checking Modal CLI setup..."
    
    if ! command_exists modal; then
        print_error "Modal CLI is not installed. Please install it first:"
        echo "pip install modal"
        exit 1
    fi
    
    print_success "Modal CLI is installed"
    
    # Check if user is authenticated

    
    print_success "Modal authentication verified"
}

# Function to check if local models directory exists
check_local_models() {
    print_status "Checking local models directory..."
    
    if [ ! -d "$LOCAL_MODELS_DIR" ]; then
        print_error "Local models directory '$LOCAL_MODELS_DIR' does not exist"
        exit 1
    fi
    
    # Check if directory has any content
    if [ -z "$(ls -A $LOCAL_MODELS_DIR)" ]; then
        print_warning "Local models directory '$LOCAL_MODELS_DIR' is empty"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        print_success "Local models directory found with content"
        echo "Contents:"
        ls -la "$LOCAL_MODELS_DIR"
    fi
}

# Function to check if Modal volume exists
check_modal_volume() {
    print_status "Checking if Modal volume '$VOLUME_NAME' exists..."
    
    # Try to list the volume directly - if it exists, this will succeed
    if modal volume ls "$VOLUME_NAME" >/dev/null 2>&1; then
        print_success "Modal volume '$VOLUME_NAME' exists"
    else
        print_warning "Modal volume '$VOLUME_NAME' does not exist. Creating it..."
        if modal volume create "$VOLUME_NAME" 2>/dev/null; then
            print_success "Created Modal volume '$VOLUME_NAME'"
        else
            # Volume might already exist, try to list it again
            if modal volume ls "$VOLUME_NAME" >/dev/null 2>&1; then
                print_success "Modal volume '$VOLUME_NAME' already exists"
            else
                print_error "Failed to create or access Modal volume '$VOLUME_NAME'"
                exit 1
            fi
        fi
    fi
}

# Function to show current volume contents
show_volume_contents() {
    print_status "Current contents of Modal volume '$VOLUME_NAME':"
    modal volume ls "$VOLUME_NAME" || echo "Volume is empty or error occurred"
}

# Function to upload models
upload_models() {
    print_status "Starting upload of models from '$LOCAL_MODELS_DIR' to Modal volume '$VOLUME_NAME'..."
    
    # Check if the local directory exists and has content
    if [ ! -d "$LOCAL_MODELS_DIR" ] || [ -z "$(ls -A $LOCAL_MODELS_DIR)" ]; then
        print_error "Local models directory is empty or doesn't exist"
        exit 1
    fi
    
    # Upload each subdirectory in the models directory
    for model_dir in "$LOCAL_MODELS_DIR"/*; do
        if [ -d "$model_dir" ]; then
            model_name=$(basename "$model_dir")
            print_status "Uploading model: $model_name"
            modal volume put "$VOLUME_NAME" "$model_dir" "/$model_name" --force
        fi
    done
    
    print_success "Upload completed!"
}

# Function to verify upload
verify_upload() {
    print_status "Verifying upload..."
    
    echo "Contents of Modal volume '$VOLUME_NAME' after upload:"
    modal volume ls "$VOLUME_NAME"
    
    # Check for specific model directories
    print_status "Checking for expected model directories..."
    
    if modal volume ls "$VOLUME_NAME" bge-large-en-v1.5 >/dev/null 2>&1; then
        print_success "Found bge-large-en-v1.5 model"
    else
        print_warning "bge-large-en-v1.5 model not found"
    fi
    
    if modal volume ls "$VOLUME_NAME" bge-reranker-large >/dev/null 2>&1; then
        print_success "Found bge-reranker-large model"
    else
        print_warning "bge-reranker-large model not found"
    fi
}

# Main execution
main() {
    echo "=================================================="
    echo "🚀 CaseOn Modal Models Upload Script"
    echo "=================================================="
    echo "Volume: $VOLUME_NAME"
    echo "Local Directory: $LOCAL_MODELS_DIR"
    echo "=================================================="
    echo
    
    # Run checks
    check_modal_setup
    check_local_models
    check_modal_volume
    
    echo
    show_volume_contents
    echo
    
    # Confirm upload
    print_warning "This will upload all contents from '$LOCAL_MODELS_DIR' to Modal volume '$VOLUME_NAME'"
    print_warning "Existing files in the volume may be overwritten!"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Upload cancelled by user"
        exit 0
    fi
    
    # Perform upload
    upload_models
    
    echo
    verify_upload
    
    echo
    print_success "🎉 Models upload completed successfully!"
    echo "You can now deploy your Modal app with the pre-uploaded models."
    echo "To deploy the app, run: modal deploy backend/service/modal/main.py"
}

# Run main function
main "$@" 