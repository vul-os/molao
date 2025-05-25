#!/usr/bin/env python3
"""
Deployment script for CaseOn Modal search service.
This script helps manage the deployment workflow.
"""

import subprocess
import sys
import os

def run_command(cmd, description):
    """Run a command and handle errors."""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        if result.stdout:
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed:")
        print(e.stderr)
        return False

def main():
    """Main deployment workflow."""
    print("🚀 Starting CaseOn Modal deployment...")
    
    # Check if Modal CLI is installed
    if not run_command("modal --version", "Checking Modal CLI"):
        print("Please install Modal CLI first: pip install modal")
        sys.exit(1)
    
    # Check if user is logged in
    if not run_command("modal token verify", "Verifying Modal authentication"):
        print("Please log in to Modal first: modal token new")
        sys.exit(1)
    
    print("\n📋 Deployment options:")
    print("1. Deploy the app")
    print("2. Test locally first")
    print("3. Setup secrets")
    print("4. View logs")
    
    choice = input("\nEnter your choice (1-4): ").strip()
    
    if choice == "1":
        # Deploy the app
        run_command("modal deploy backend/service/modal/main.py", "Deploying Modal app")
        
    elif choice == "2":
        # Test locally
        run_command("modal run backend/service/modal/main.py", "Testing app locally")
        
    elif choice == "3":
        # Setup secrets
        run_command("python backend/service/modal/setup_secrets.py", "Setting up secrets")
        
    elif choice == "4":
        # View logs
        print("Enter the app name or leave empty for 'caseon-inference':")
        app_name = input().strip() or "caseon-inference"
        run_command(f"modal logs {app_name}", f"Viewing logs for {app_name}")
        
    else:
        print("Invalid choice")
        
    print("\n✨ Done!")

if __name__ == "__main__":
    main() 