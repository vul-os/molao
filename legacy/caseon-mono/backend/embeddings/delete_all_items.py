import tomli
from qdrant_client import QdrantClient
import logging
from typing import Dict, Any
from qdrant_client.models import Filter

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
        api_key=qdrant_config['api_key'] if qdrant_config['api_key'] != "your-qdrant-api-key-here" else None,
        timeout=60
    )
    
    return client, qdrant_config['collection_name']

def delete_all_items():
    """Delete all items from the collection."""
    client, collection_name = get_qdrant_client()
    
    try:
        # Check if collection exists
        collection_info = client.get_collection(collection_name)
        initial_count = collection_info.points_count
        logger.info(f"Collection '{collection_name}' found with {initial_count} total points")
        
        if initial_count == 0:
            logger.info("Collection is already empty!")
            return True
        
        # Ask for confirmation
        print(f"\n{'='*60}")
        print(f"WARNING: DELETE ALL ITEMS")
        print(f"{'='*60}")
        print(f"Collection: {collection_name}")
        print(f"Total points to delete: {initial_count}")
        print(f"{'='*60}")
        
        confirmation = input("Are you sure you want to delete ALL items? Type 'DELETE ALL' to confirm: ")
        
        if confirmation != "DELETE ALL":
            logger.info("Operation cancelled by user.")
            return False
        
        logger.info("Starting deletion of all points...")
        
        # Get collection configuration before deletion
        collection_config = client.get_collection(collection_name)
        
        # Delete the entire collection
        client.delete_collection(collection_name)
        logger.info("Collection deleted.")
        
        # Recreate the collection with the same configuration
        client.create_collection(
            collection_name=collection_name,
            vectors_config=collection_config.config.params.vectors
        )
        logger.info("Collection recreated with same configuration.")
        
        logger.info("Deletion completed!")
        
        # Verify deletion
        collection_info_after = client.get_collection(collection_name)
        final_count = collection_info_after.points_count
        
        print(f"\n{'='*60}")
        print(f"DELETION SUMMARY")
        print(f"{'='*60}")
        print(f"Points before deletion: {initial_count}")
        print(f"Points after deletion: {final_count}")
        print(f"Points deleted: {initial_count - final_count}")
        print(f"{'='*60}")
        
        if final_count == 0:
            logger.info("✅ All points successfully deleted!")
            return True
        else:
            logger.warning(f"⚠️ {final_count} points still remain in collection")
            return False
        
    except Exception as e:
        logger.error(f"Error deleting from collection: {e}")
        return False

def main():
    logger.info("Preparing to delete all items from Qdrant collection...")
    
    success = delete_all_items()
    
    if success:
        print("\n✅ Collection cleared successfully!")
    else:
        print("\n❌ Failed to clear collection or operation was cancelled.")

if __name__ == "__main__":
    main() 