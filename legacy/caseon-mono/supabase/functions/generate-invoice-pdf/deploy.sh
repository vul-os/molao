#!/bin/bash

# Make sure script fails on errors
set -e

echo "Deploying generate-invoice-pdf Edge Function..."

# Navigate to the function directory
cd "$(dirname "$0")"

# Deploy the function
supabase functions deploy generate-invoice-pdf --no-verify-jwt

echo "Deployment complete!"
echo "You can now generate PDF invoices from your application." 