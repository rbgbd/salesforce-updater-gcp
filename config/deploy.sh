#!/bin/bash

echo "🚀 Deploying Salesforce Updater to Google Cloud..."

# Set variables
FUNCTION_NAME="salesforce-updater"
REGION="us-central1"
RUNTIME="nodejs18"

# Deploy function
gcloud functions deploy $FUNCTION_NAME \
  --runtime $RUNTIME \
  --trigger-http \
  --allow-unauthenticated \
  --memory 512MB \
  --timeout 540s \
  --region $REGION \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT,STORAGE_BUCKET=$STORAGE_BUCKET

echo "✅ Deployment complete!"
echo "Function URL: https://$REGION-$GOOGLE_CLOUD_PROJECT.cloudfunctions.net/$FUNCTION_NAME"