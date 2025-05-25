#!/bin/bash

# CaseOn Modal Models Upload Script
# This script uploads models from local /models directory to Modal storage volume

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
LOCAL_MODELS_DIR="/models"
ACTION="upload"
MODEL_NAME="all"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
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

# Function to show help
show_help() {
    echo "CaseOn Modal Models Upload Script"
    echo ""
    echo "Usage: $0 [ACTION] [LOCAL_DIR] [MODEL_NAME]"
    echo ""
    echo "Actions:"
    echo "  upload    Upload models to Modal volume (default)"
    echo "  list      List contents of Modal volume"
    echo "  clear     Clear all contents from Modal volume"
    echo ""
    echo "Arguments:"
    echo "  LOCAL_DIR   Local directory containing models (default: /models)"
    echo "  MODEL_NAME  Specific model to upload or 'all' (default: all)"
    echo ""
    echo "Available models:"
    echo "  - bge-large-en-v1.5     (Embedding model)"
    echo "  - bge-reranker-large    (Reranker model)"
    echo "  - all                   (Upload all available models)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Upload all models from /models"
    echo "  $0 upload /my/models                 # Upload all models from /my/models"
    echo "  $0 upload /models bge-large-en-v1.5  # Upload only embedding model"
    echo "  $0 list                              # List volume contents"
    echo "  $0 clear                             # Clear volume contents"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check if Modal is installed
    if ! command -v modal &> /dev/null; then
        print_error "Modal CLI is not installed"
        echo "Please install it with: pip install modal"
        exit 1
    fi
    
    # Check if user is logged in to Modal
    if ! modal token verify &> /dev/null; then
        print_error "Not logged in to Modal"
        echo "Please log in with: modal token new"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to check local models directory
check_local_models() {
    if [ "$ACTION" != "upload" ]; then
        return 0
    fi
    
    print_info "Checking local models directory: $LOCAL_MODELS_DIR"
    
    if [ ! -d "$LOCAL_MODELS_DIR" ]; then
        print_error "Local models directory not found: $LOCAL_MODELS_DIR"
        echo ""
        echo "Please ensure your models are downloaded and available at the specified path."
        echo "Expected structure:"
        echo "  $LOCAL_MODELS_DIR/"
        echo "  ├── bge-large-en-v1.5/"
        echo "  │   ├── config.json"
        echo "  │   ├── pytorch_model.bin"
        echo "  │   └── tokenizer.json"
        echo "  └── bge-reranker-large/"
        echo "      ├── config.json"
        echo "      ├── pytorch_model.bin"
        echo "      └── tokenizer.json"
        exit 1
    fi
    
    # Check for specific models
    models_found=0
    
    if [ -d "$LOCAL_MODELS_DIR/bge-large-en-v1.5" ]; then
        print_success "Found embedding model: bge-large-en-v1.5"
        models_found=$((models_found + 1))
    else
        print_warning "Embedding model not found: $LOCAL_MODELS_DIR/bge-large-en-v1.5"
    fi
    
    if [ -d "$LOCAL_MODELS_DIR/bge-reranker-large" ]; then
        print_success "Found reranker model: bge-reranker-large"
        models_found=$((models_found + 1))
    else
        print_warning "Reranker model not found: $LOCAL_MODELS_DIR/bge-reranker-large"
    fi
    
    if [ $models_found -eq 0 ]; then
        print_error "No models found in $LOCAL_MODELS_DIR"
        echo ""
        echo "Please download the models first or check the directory path."
        exit 1
    fi
    
    print_info "Found $models_found model(s) ready for upload"
}

# Function to estimate upload size
estimate_upload_size() {
    if [ "$ACTION" != "upload" ]; then
        return 0
    fi
    
    print_info "Estimating upload size..."
    
    total_size=0
    
    if [ "$MODEL_NAME" = "all" ] || [ "$MODEL_NAME" = "bge-large-en-v1.5" ]; then
        if [ -d "$LOCAL_MODELS_DIR/bge-large-en-v1.5" ]; then
            size=$(du -sb "$LOCAL_MODELS_DIR/bge-large-en-v1.5" 2>/dev/null | cut -f1 || echo "0")
            total_size=$((total_size + size))
            print_info "Embedding model size: $(numfmt --to=iec $size)"
        fi
    fi
    
    if [ "$MODEL_NAME" = "all" ] || [ "$MODEL_NAME" = "bge-reranker-large" ]; then
        if [ -d "$LOCAL_MODELS_DIR/bge-reranker-large" ]; then
            size=$(du -sb "$LOCAL_MODELS_DIR/bge-reranker-large" 2>/dev/null | cut -f1 || echo "0")
            total_size=$((total_size + size))
            print_info "Reranker model size: $(numfmt --to=iec $size)"
        fi
    fi
    
    if [ $total_size -gt 0 ]; then
        print_info "Total upload size: $(numfmt --to=iec $total_size)"
        
        # Warn if size is very large
        if [ $total_size -gt 10737418240 ]; then  # 10GB
            print_warning "Large upload detected (>10GB). This may take significant time and incur costs."
            read -p "Continue? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                print_info "Upload cancelled by user"
                exit 0
            fi
        fi
    fi
}

# Function to run the upload
run_modal_script() {
    print_info "Running Modal upload script..."
    
    # Change to script directory to ensure proper imports
    cd "$SCRIPT_DIR"
    
    # Run the Python script with Modal
    modal run upload_models.py::main --action="$ACTION" --local-models-dir="$LOCAL_MODELS_DIR" --model-name="$MODEL_NAME"
    
    if [ $? -eq 0 ]; then
        case $ACTION in
            "upload")
                print_success "Models uploaded successfully!"
                print_info "Your models are now available in the Modal volume and ready for inference."
                ;;
            "list")
                print_success "Volume contents listed successfully!"
                ;;
            "clear")
                print_success "Volume cleared successfully!"
                ;;
        esac
    else
        print_error "Modal script failed"
        exit 1
    fi
}

# Main execution
main() {
    # Parse command line arguments
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        show_help
        exit 0
    fi
    
    # Set variables from arguments
    if [ -n "$1" ]; then
        ACTION="$1"
    fi
    
    if [ -n "$2" ]; then
        LOCAL_MODELS_DIR="$2"
    fi
    
    if [ -n "$3" ]; then
        MODEL_NAME="$3"
    fi
    
    # Validate action
    if [[ ! "$ACTION" =~ ^(upload|list|clear)$ ]]; then
        print_error "Invalid action: $ACTION"
        echo "Valid actions: upload, list, clear"
        echo "Use --help for more information"
        exit 1
    fi
    
    # Show banner
    echo ""
    echo "🚀 CaseOn Modal Models Upload Script"
    echo "======================================"
    echo "Action: $ACTION"
    if [ "$ACTION" = "upload" ]; then
        echo "Local directory: $LOCAL_MODELS_DIR"
        echo "Model: $MODEL_NAME"
    fi
    echo ""
    
    # Run checks and operations
    check_prerequisites
    check_local_models
    estimate_upload_size
    
    # Confirm before proceeding
    if [ "$ACTION" = "clear" ]; then
        print_warning "This will permanently delete all models from the Modal volume!"
        read -p "Are you sure? Type 'yes' to confirm: " -r
        echo
        if [ "$REPLY" != "yes" ]; then
            print_info "Operation cancelled"
            exit 0
        fi
    elif [ "$ACTION" = "upload" ]; then
        print_info "Ready to upload models to Modal volume"
        read -p "Proceed? (Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            print_info "Upload cancelled by user"
            exit 0
        fi
    fi
    
    # Execute the operation
    run_modal_script
    
    echo ""
    print_success "Operation completed successfully!"
}

# Run main function with all arguments
main "$@" 