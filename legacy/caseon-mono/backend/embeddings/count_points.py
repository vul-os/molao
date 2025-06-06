import tomli
from qdrant_client import QdrantClient
from qdrant_client import models
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def load_config():
    """Load configuration from config.toml"""
    try:
        with open("config.toml", "rb") as f:
            return tomli.load(f)
    except FileNotFoundError:
        logger.warning("config.toml not found, using default values")
        return {
            'qdrant': {
                'url': "http://169.239.182.79:6333",
                'api_key': "your-strong-secret-key-here-caseonza",
                'collection_name': "file_vectors"
            }
        }

def get_qdrant_client():
    """Initialize Qdrant client"""
    config = load_config()
    qdrant_config = config['qdrant']
    
    client = QdrantClient(
        url=qdrant_config['url'],
        api_key=qdrant_config['api_key'] if qdrant_config['api_key'] != "your-qdrant-api-key-here" else None,
        timeout=60
    )
    
    return client, qdrant_config['collection_name']

def print_counting_info():
    """Print information about Qdrant's counting functionality"""
    print("""
Counting points
Available as of v0.8.4

Sometimes it can be useful to know how many points fit the filter conditions without doing a real search.

Among others, for example, we can highlight the following scenarios:

- Evaluation of results size for faceted search
- Determining the number of pages for pagination
- Debugging the query execution speed

Usage:
client.count(
    collection_name="{collection_name}",
    count_filter=models.Filter(
        must=[
            models.FieldCondition(key="color", match=models.MatchValue(value="red")),
        ]
    ),
    exact=True,
)

Returns number of counts matching given filtering conditions:
{
  "count": 3811
}
""")

def count_total_points():
    """Count total points in collection"""
    client, collection_name = get_qdrant_client()
    
    try:
        collection_info = client.get_collection(collection_name)
        total_points = collection_info.points_count
        
        print(f"Total points in collection '{collection_name}': {total_points:,}")
        return total_points
        
    except Exception as e:
        logger.error(f"Error getting total points: {e}")
        return None

def count_points_by_field(field_name: str, field_value: str):
    """Count points matching a specific field value using Qdrant's count API"""
    client, collection_name = get_qdrant_client()
    
    try:
        count_result = client.count(
            collection_name=collection_name,
            count_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key=field_name,
                        match=models.MatchValue(value=field_value)
                    )
                ]
            ),
            exact=True,
        )
        
        print(f"Count for {field_name}='{field_value}': {count_result.count:,}")
        return count_result.count
        
    except Exception as e:
        logger.error(f"Error counting points: {e}")
        return None

def count_points_by_file_id(file_id: str):
    """Count points for a specific file_id"""
    print(f"Counting points for file_id: {file_id}")
    return count_points_by_field("file_id", file_id)

def count_points_by_file_name(file_name: str):
    """Count points for a specific file_name"""
    print(f"Counting points for file_name: {file_name}")
    return count_points_by_field("file_name", file_name)

def count_unique_file_ids():
    """
    Count unique file IDs in the collection.
    
    Note: Qdrant's count API cannot directly count unique values.
    This function uses minimal scrolling (payload only, no vectors) to discover unique file IDs.
    """
    client, collection_name = get_qdrant_client()
    
    print("Note: count API cannot directly count unique values.")
    print("Using minimal scroll (payload only) to discover unique file IDs...")
    
    try:
        unique_file_ids = set()
        offset = None
        processed_points = 0
        
        while True:
            # Scroll with minimal data - only file_id payload, no vectors
            scroll_result = client.scroll(
                collection_name=collection_name,
                limit=5000,
                offset=offset,
                with_payload=["file_id"],
                with_vectors=False
            )
            
            points, next_offset = scroll_result
            if not points:
                break
            
            # Extract unique file IDs
            for point in points:
                if point.payload and "file_id" in point.payload:
                    unique_file_ids.add(point.payload["file_id"])
                processed_points += 1
            
            offset = next_offset
            if offset is None:
                break
        
        print(f"Processed {processed_points:,} points")
        print(f"Found {len(unique_file_ids):,} unique file IDs")
        
        return len(unique_file_ids), unique_file_ids
        
    except Exception as e:
        logger.error(f"Error counting unique file IDs: {e}")
        return None, None

def verify_file_ids_with_count_api(file_ids):
    """
    Use count API to verify each file ID and show counts.
    This demonstrates how count API works with known values.
    """
    client, collection_name = get_qdrant_client()
    
    print(f"\nUsing count API to verify {len(file_ids)} file IDs...")
    
    verified_count = 0
    for i, file_id in enumerate(file_ids):
        try:
            count_result = client.count(
                collection_name=collection_name,
                count_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="file_id",
                            match=models.MatchValue(value=file_id)
                        )
                    ]
                ),
                exact=True,
            )
            
            if count_result.count > 0:
                verified_count += 1
                if i < 5:  # Show first 5 as examples
                    print(f"  {file_id}: {count_result.count:,} points")
                elif i == 5:
                    print(f"  ... (showing first 5, total: {len(file_ids)})")
            
        except Exception as e:
            logger.error(f"Error counting file_id {file_id}: {e}")
    
    print(f"Verified {verified_count} file IDs using count API")

def count_api_limitations():
    """Explain count API limitations for unique value counting"""
    print("""
COUNT API LIMITATIONS FOR UNIQUE VALUES:

The Qdrant count API can:
✓ Count points matching specific filter conditions
✓ Count points with field="specific_value"
✓ Use complex filters (AND, OR, NOT conditions)

The Qdrant count API cannot:
✗ Count unique values in a field
✗ Return what values exist in a field
✗ Aggregate or group by field values

To count unique values, you must:
1. Discover unique values (requires scrolling payload)
2. Optionally use count API to verify each value

Example count API usage:
client.count(
    collection_name="collection",
    count_filter=models.Filter(
        must=[models.FieldCondition(key="file_id", match=models.MatchValue(value="known_id"))]
    ),
    exact=True
)
""")

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Count points in Qdrant collection using count API")
    parser.add_argument("--info", action="store_true", help="Show counting API information")
    parser.add_argument("--limitations", action="store_true", help="Show count API limitations")
    parser.add_argument("--total", action="store_true", help="Count total points in collection")
    parser.add_argument("--unique-file-ids", action="store_true", help="Count unique file IDs")
    parser.add_argument("--verify-file-ids", action="store_true", help="Verify file IDs with count API")
    parser.add_argument("--file-id", type=str, help="Count points for specific file_id")
    parser.add_argument("--file-name", type=str, help="Count points for specific file_name")
    parser.add_argument("--field", type=str, help="Field name to filter by")
    parser.add_argument("--value", type=str, help="Field value to filter by")
    
    args = parser.parse_args()
    
    if args.info:
        print_counting_info()
        return
    
    if args.limitations:
        count_api_limitations()
        return
    
    if args.total:
        count_total_points()
        return
    
    if args.unique_file_ids:
        count, file_ids = count_unique_file_ids()
        if args.verify_file_ids and file_ids:
            verify_file_ids_with_count_api(file_ids)
        return
    
    if args.file_id:
        count_points_by_file_id(args.file_id)
        return
    
    if args.file_name:
        count_points_by_file_name(args.file_name)
        return
    
    if args.field and args.value:
        count_points_by_field(args.field, args.value)
        return
    
    # Default: show info and total count
    print_counting_info()
    print("\n" + "="*50)
    count_total_points()

if __name__ == "__main__":
    main() 