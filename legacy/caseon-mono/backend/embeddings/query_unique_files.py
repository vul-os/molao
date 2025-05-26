import tomli
from qdrant_client import QdrantClient
import logging
from typing import Dict, Any, Set

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

def query_unique_file_names():
    """Query and count unique file names in the collection."""
    client, collection_name = get_qdrant_client()
    
    try:
        # Check if collection exists
        collection_info = client.get_collection(collection_name)
        logger.info(f"Collection '{collection_name}' found with {collection_info.points_count} total points")
        
        # Get all points with file_name payload
        unique_file_names: Set[str] = set()
        offset = None
        batch_size = 1000
        total_points = 0
        
        logger.info("Fetching all points to count unique file names...")
        
        while True:
            # Scroll through all points
            scroll_result = client.scroll(
                collection_name=collection_name,
                limit=batch_size,
                offset=offset,
                with_payload=["file_name", "file_id"]
            )
            
            points, next_offset = scroll_result
            
            if not points:
                break
                
            # Extract unique file names
            for point in points:
                if point.payload and "file_name" in point.payload:
                    unique_file_names.add(point.payload["file_name"])
                total_points += 1
            
            offset = next_offset
            if offset is None:
                break
                
            logger.info(f"Processed {total_points} points so far, found {len(unique_file_names)} unique files")
        
        logger.info(f"Scan complete!")
        logger.info(f"Total points processed: {total_points}")
        logger.info(f"Number of unique file names: {len(unique_file_names)}")
        
        # Print some sample file names
        if unique_file_names:
            logger.info("Sample file names:")
            for i, file_name in enumerate(sorted(unique_file_names)[:10]):
                logger.info(f"  {i+1}. {file_name}")
            if len(unique_file_names) > 10:
                logger.info(f"  ... and {len(unique_file_names) - 10} more files")
        
        return len(unique_file_names), unique_file_names
        
    except Exception as e:
        logger.error(f"Error querying collection: {e}")
        return 0, set()

def main():
    logger.info("Querying unique file names in Qdrant collection...")
    
    unique_count, file_names = query_unique_file_names()
    
    print(f"\n{'='*50}")
    print(f"SUMMARY")
    print(f"{'='*50}")
    print(f"Unique file names in collection: {unique_count}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main() 