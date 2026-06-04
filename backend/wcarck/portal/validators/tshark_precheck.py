import asyncio
import os
from typing import Dict, Any
import shutil

class TsharkPrecheck:
    @staticmethod
    async def run(cap_path: str) -> Dict[str, Any]:
        """
        Runs a fast tshark pre-check to identify PMKID or EAPOL frames.
        Returns {pmkid: bool, eapol_count: int, has_m2_m3: bool}
        """
        if not shutil.which("tshark"):
            return {"pmkid": False, "eapol_count": 0, "has_m2_m3": False, "error": "tshark not found"}

        cmd = [
            "tshark", "-r", cap_path, 
            "-Y", "eapol || wlan.fc.type_subtype==0x8"
        ]
        
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await proc.communicate()
        output = stdout.decode('utf-8', errors='ignore')
        
        # In MVP we parse the output loosely.
        eapol_count = output.count("EAPOL")
        pmkid = "PMKID" in output # Simplified check for PMKID presence
        has_m2_m3 = eapol_count >= 2 # Simplified proxy for having M2/M3
        
        return {
            "pmkid": pmkid,
            "eapol_count": eapol_count,
            "has_m2_m3": has_m2_m3
        }

