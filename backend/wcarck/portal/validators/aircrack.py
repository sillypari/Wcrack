import asyncio
import os
import shutil
import tempfile

class AircrackValidator:
    _semaphore = asyncio.Semaphore(1)
    
    @classmethod
    async def validate(cls, bssid: str, password: str, cap_path: str, timeout_s: int = 30) -> bool:
        """
        Spawns aircrack-ng to validate a submitted password against a handshake file.
        Returns True if valid, False otherwise.
        """
        if not shutil.which("aircrack-ng"):
            return False
            
        async with cls._semaphore:
            # We use a temp file for the wordlist instead of process substitution <(...)
            # to ensure cross-compatibility with asyncio subprocess execution.
            with tempfile.NamedTemporaryFile(mode='w', delete=False) as tf:
                tf.write(password + "\n")
                wordlist_path = tf.name
                
            cmd = [
                "aircrack-ng", "-a", "2", "-b", bssid, "-w", wordlist_path, cap_path
            ]
            
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                # Enforce timeout per D84
                try:
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
                    return proc.returncode == 0
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()
                    # A timeout on a single word is unexpected and implies an error, 
                    # but we treat as inconclusive/false for the portal submission.
                    return False
            finally:
                if os.path.exists(wordlist_path):
                    os.unlink(wordlist_path)

