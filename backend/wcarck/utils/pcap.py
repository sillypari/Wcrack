import asyncio
import os
import re
import structlog
from typing import Tuple

logger = structlog.get_logger()

async def verify_handshake(pcap_path: str) -> Tuple[str, str]:
    """
    Checks a capture file for valid WPA handshakes using aircrack-ng.
    Returns a tuple of (status, bssid).
    status can be: "Valid", "Partial", or "Invalid"
    """
    if not os.path.exists(pcap_path):
        return "Invalid", ""

    if os.name == 'nt':
        # Mock for Windows dev
        return "Valid", "11:22:33:44:55:66"

    proc = None
    try:
        # Run aircrack-ng on the pcap file to see what networks it detects.
        # It usually outputs a list of networks if it finds handshakes.
        proc = await asyncio.create_subprocess_exec(
            "aircrack-ng", pcap_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        # We need to feed it an input '1' just in case it asks to select a network,
        # but realistically we just want to read the initial output block.
        # So we wait for a bit, then kill it if it hangs.
        stdout, _ = await asyncio.wait_for(proc.communicate(input=b"1\n"), timeout=5.0)
        output = stdout.decode('utf-8', errors='ignore')
        
        # Regex to find handshake rows in the aircrack-ng index table
        # Typical aircrack output row:
        #  1  00:11:22:33:44:55  MyNetwork  WPA (1 handshake)
        #  2  AA:BB:CC:DD:EE:FF  OtherNet   WPA (0 handshake)
        
        valid_bssid = ""
        status = "Invalid"
        
        lines = output.split('\n')
        for line in lines:
            if "WPA" in line:
                match = re.search(r'([\w:]+).*WPA \(\s*(\d+)\s+handshake(s)?\s*(,\s*with PMKID)?\)', line)
                if match:
                    bssid = match.group(1)
                    handshakes = int(match.group(2))
                    has_pmkid = bool(match.group(4))
                    
                    if handshakes > 0 or has_pmkid:
                        # For simplicity, if aircrack-ng says it has a handshake or PMKID, we mark it Valid.
                        # (A real "Partial" check would require running tshark or pyrit, but this is a solid heuristic).
                        return "Valid", bssid
                        
        return status, valid_bssid

    except asyncio.TimeoutError:
        if proc:
            try:
                proc.kill()
            except Exception:
                pass
        return "Invalid", ""
    except Exception as e:
        logger.error(f"Error verifying handshake in {pcap_path}: {e}")
        return "Invalid", ""
