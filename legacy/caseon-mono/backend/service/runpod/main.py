import runpod
import os
from rp_handler import handler

def print_raw_directory():
    print("Contents of /raw directory:")
    try:
        for root, dirs, files in os.walk('/raw'):
            level = root.replace('/raw', '').count(os.sep)
            indent = ' ' * 4 * level
            print(f"{indent}{os.path.basename(root)}/")
            subindent = ' ' * 4 * (level + 1)
            for f in files:
                print(f"{subindent}{f}")
    except Exception as e:
        print(f"Error reading /raw directory: {e}")

if __name__ == "__main__":
    print_raw_directory()
    runpod.serverless.start({'handler': handler}) 