import tomli
from qdrant_client import QdrantClient
import logging
from typing import Dict, Any
import random

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def load_config() -> Dict[str, Any]:
    with open("config.toml", "rb") as f:
        return tomli.load(f)

def get_qdrant_client():
    config = load_config()
    qdrant_config = config['qdrant']
    
    client = QdrantClient(
        url=qdrant_config['url'],
        api_key=qdrant_config['api_key'] if qdrant_config['api_key'] != "your-qdrant-api-key-here" else None
    )
    
    return client, qdrant_config['collection_name']

def get_random_item():
    """Get and print 1 random item from the collection."""
    client, collection_name = get_qdrant_client()
    
    try:
        # Check if collection exists
        collection_info = client.get_collection(collection_name)
        logger.info(f"Collection '{collection_name}' found with {collection_info.points_count} total points")
        
        if collection_info.points_count == 0:
            logger.warning("Collection is empty!")
            return None
        
        # Get a random batch of points
        scroll_result = client.scroll(
            collection_name=collection_name,
            limit=100,  # Get a batch to choose from
            with_payload=True
        )
        
        points, _ = scroll_result
        
        if not points:
            logger.warning("No points found in collection!")
            return None
        
        # Select a random point from the batch
        random_point = random.choice(points)
        
        logger.info("Random item selected!")
        print(f"\n{'='*60}")
        print(f"RANDOM ITEM FROM COLLECTION")
        print(f"{'='*60}")
        print(f"Point ID: {random_point.id}")
        
        if random_point.payload:
            print(f"Payload:")
            for key, value in random_point.payload.items():
                print(f"  {key}: {value}")
        else:
            print("No payload data")
        
        # Note: Vectors are not retrieved by scroll method by default
        # If you need vector data, you would need to use client.retrieve() with the point ID
        print("Vector data: Not retrieved (use client.retrieve() for vector data)")
        
        print(f"{'='*60}")
        
        return random_point
        
    except Exception as e:
        logger.error(f"Error querying collection: {e}")
        return None

def main():
    logger.info("Getting 1 random item from Qdrant collection...")
    
    random_item = get_random_item()
    
    if random_item is None:
        print("Failed to retrieve random item from collection.")

if __name__ == "__main__":
    main() 