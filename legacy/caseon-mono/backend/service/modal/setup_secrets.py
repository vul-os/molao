#!/usr/bin/env python3
"""
Helper script to set up Modal secrets for the CaseOn search service.
Run this script to configure your Supabase credentials as Modal secrets.
"""

import modal
import os

def setup_supabase_secrets():
    """Set up Supabase secrets in Modal."""
    
    # Get environment variables or prompt for them
    supabase_url = os.environ.get("SUPABASE_URL") or input("Enter your Supabase URL: ")
    supabase_key = os.environ.get("SUPABASE_KEY") or input("Enter your Supabase service key: ")
    
    if not supabase_url or not supabase_key:
        print("Error: Both SUPABASE_URL and SUPABASE_KEY are required")
        return
    
    # Create Modal secret
    try:
        secret = modal.Secret.from_dict({
            "SUPABASE_URL": supabase_url,
            "SUPABASE_KEY": supabase_key,
        })
        
        # Save the secret with the name expected by main.py
        secret.save("supabase-secrets")
        
        print("✅ Supabase secrets successfully configured in Modal!")
        print("You can now deploy your Modal app with: modal deploy backend/service/modal/main.py")
        
    except Exception as e:
        print(f"❌ Error setting up secrets: {str(e)}")
        print("Make sure you have Modal CLI installed and are logged in.")

if __name__ == "__main__":
    setup_supabase_secrets() 