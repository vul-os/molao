import runpod
from rp_handler import handler

if __name__ == "__main__":
    runpod.serverless.start({'handler': handler}) 