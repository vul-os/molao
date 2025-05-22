# Set your project ID and region
PROJECT_ID=caseon-za
REGION=us-central1
REPO=ml-models
IMAGE_NAME=embedding-service
TAG=v1

# Build the container
gcloud builds submit --tag gcr.io/$PROJECT_ID/$REPO/$IMAGE_NAME:$TAG .

# Create a model in Vertex AI
gcloud ai models upload \
  --region=$REGION \
  --display-name=embeddings-reranker-service \
  --container-image-uri=gcr.io/$PROJECT_ID/$REPO/$IMAGE_NAME:$TAG \
  --container-predict-route=/predict \
  --container-health-route=/health \
  --container-command="python" \
  --container-args="main.py" \
  --container-env-vars="MODEL_BUCKET=caseon-models" \
  --container-ports=8080

# Create an endpoint
gcloud ai endpoints create \
  --region=$REGION \
  --display-name=embeddings-service-endpoint

# Get the endpoint ID
ENDPOINT_ID=$(gcloud ai endpoints list \
  --region=$REGION \
  --filter=display-name=embeddings-service-endpoint \
  --format='value(name)')

# Print the endpoint ID for verification
echo "Endpoint ID: $ENDPOINT_ID"

# Deploy model to endpoint
gcloud ai endpoints deploy-model 5454972954024607744 \
  --region=us-central1 \
  --model=1433344248689721344 \
  --display-name=embeddings-deploy \
  --machine-type=n1-standard-4 \
  --accelerator=count=1,type=nvidia-tesla-t4 \
  --min-replica-count=1 \
  --max-replica-count=3