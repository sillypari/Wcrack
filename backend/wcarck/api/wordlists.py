from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import os
import shutil
import structlog
from typing import List

logger = structlog.get_logger()
router = APIRouter(prefix="/api/wordlists", tags=["wordlists"])

WCARCK_WORDLISTS_DIR = "/var/lib/wcarck/wordlists"
SYSTEM_WORDLISTS_DIR = "/usr/share/wordlists"

# Fallbacks for Windows dev
if os.name == 'nt':
    WCARCK_WORDLISTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "wordlists"))
    SYSTEM_WORDLISTS_DIR = WCARCK_WORDLISTS_DIR
    os.makedirs(WCARCK_WORDLISTS_DIR, exist_ok=True)

class WordlistInfo(BaseModel):
    name: str
    path: str
    size: int
    type: str

@router.get("", response_model=List[WordlistInfo])
async def list_wordlists():
    """Scan and return available wordlists from system and user directories."""
    results = []
    
    dirs_to_scan = [
        ("System", SYSTEM_WORDLISTS_DIR),
        ("Custom", WCARCK_WORDLISTS_DIR)
    ]
    
    for w_type, d in dirs_to_scan:
        if not os.path.exists(d):
            continue
            
        for root, _, files in os.walk(d):
            for file in files:
                if file.endswith(".txt") or file.endswith(".gz"):
                    path = os.path.join(root, file)
                    try:
                        size = os.path.getsize(path)
                        results.append(WordlistInfo(
                            name=file,
                            path=path,
                            size=size,
                            type=w_type
                        ))
                    except Exception as e:
                        logger.warning(f"Could not stat wordlist {path}: {e}")
                        
    # Sort by name, prioritizing rockyou.txt
    results.sort(key=lambda x: (0 if "rockyou" in x.name.lower() else 1, x.name))
    
    return results

@router.post("/upload")
async def upload_wordlist(file: UploadFile = File(...)):
    """Upload a custom wordlist to Wcarck."""
    if not file.filename.endswith('.txt') and not file.filename.endswith('.gz'):
        raise HTTPException(status_code=400, detail="Only .txt and .gz files are allowed")
        
    os.makedirs(WCARCK_WORDLISTS_DIR, exist_ok=True)
    file_path = os.path.join(WCARCK_WORDLISTS_DIR, file.filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        size = os.path.getsize(file_path)
        logger.info(f"Custom wordlist uploaded: {file.filename} ({size} bytes)")
        
        return {
            "status": "success",
            "wordlist": {
                "name": file.filename,
                "path": file_path,
                "size": size,
                "type": "Custom"
            }
        }
    except Exception as e:
        logger.error(f"Failed to save wordlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))
