import asyncio
import os
import re
from typing import Any, Optional
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
from wcarck.hardware.process import ManagedProcess
import structlog

logger = structlog.get_logger()

class CrackModule(Module):
    """
    Offline password cracking module wrapper.
    Runs aircrack-ng against a captured .cap or .pcapng file using a specified wordlist.
    """
    def __init__(self):
        self._process: Optional[ManagedProcess] = None
        self._running = False
        self._output_task: Optional[asyncio.Task] = None

    @property
    def name(self) -> str:
        return "crack.aircrack"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        self._running = True
        
        capture_file = params.get("capture_file")
        wordlist = params.get("wordlist", "/usr/share/wordlists/rockyou.txt")
        bssid = params.get("bssid") # optional target BSSID filter
        
        if not capture_file:
            raise ValueError("Capture file path is required")
            
        if not os.path.exists(capture_file) and os.name != 'nt':
            raise FileNotFoundError(f"Capture file not found: {capture_file}")
            
        bus.publish("module.started", {"job_id": job_id, "module": self.name})
        
        cmd = ["aircrack-ng", "-w", wordlist]
        if bssid:
            cmd.extend(["-b", bssid])
        cmd.append(capture_file)
        
        # Gap 45: clear hashcat.potfile if it exists (for when hashcat is used)
        try:
            home = os.path.expanduser("~")
            potfile = os.path.join(home, ".hashcat", "hashcat.potfile")
            if os.path.exists(potfile):
                os.remove(potfile)
        except OSError:
            pass
        
        if os.name == 'nt':
            # Windows dev dummy
            cmd = ["python", "-c", "import time; print('Reading packets...'); time.sleep(1); print('KEY FOUND! [ testing123 ]'); time.sleep(1)"]
            
        self._process = ManagedProcess(cmd=cmd, job_id=job_id)
        
        # Gap 46: Retry on transient TimeoutExpired
        retry_count = 0
        while retry_count < 3:
            try:
                await self._process.start()
                break
            except asyncio.TimeoutError:
                retry_count += 1
                if retry_count >= 3:
                    bus.publish("module.error", {"job_id": job_id, "module": self.name, "message": "Failed to start cracking process due to timeout."})
                    return
                await asyncio.sleep(1)
        
        # Start a task to monitor the process and check for success
        self._output_task = asyncio.create_task(self._monitor_crack(job_id))

    async def stop(self, job_id: str) -> None:
        self._running = False
        if self._process:
            await self._process.stop()
            self._process = None
            
        if self._output_task:
            self._output_task.cancel()
            try:
                await self._output_task
            except asyncio.CancelledError:
                pass
            self._output_task = None
            
        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._process is not None,
            "module": self.name
        }

    async def _monitor_crack(self, job_id: str):
        if not self._process:
            return
            
        key_found = False
        cracked_key = None
        
        try:
            sub = bus.subscribe(max_queue_size=500)
            
            import re
            aircrack_nums_re = re.compile(r'(\d+)/\s*(\d+) keys tested.*\(([\d.]+)\s+k/s')
            aircrack_key_re  = re.compile(r'Current passphrase:\s*([^\s].*[^\s])\s*$')
            
            async for event in sub:
                if not self._running:
                    break
                    
                topic = event.get("topic")
                payload = event.get("payload", {})
                
                if topic == "process.stdout" and payload.get("job_id") == job_id:
                    line = payload.get("line", "")
                    
                    # Parse key from Wifite2 regex
                    match_keys = aircrack_key_re.search(line)
                    if match_keys:
                        key_found = True
                        cracked_key = match_keys.group(1)
                        bus.publish("credential.captured", {
                            "job_id": job_id,
                            "type": "wpa_psk",
                            "plainText": cracked_key,
                            "valid": True,
                            "timestamp": asyncio.get_event_loop().time()
                        })
                        
                        bus.publish("job.updated", {
                            "id": job_id,
                            "progress": 100,
                            "crackedKey": cracked_key
                        })
                        logger.info(f"CRACK SUCCESS: Key found -> {cracked_key}")
                        break
                        
                    # Parse progress from Wifite2 regex
                    match_nums = aircrack_nums_re.search(line)
                    if match_nums:
                        try:
                            num_tried = int(match_nums.group(1))
                            num_total = int(match_nums.group(2))
                            num_kps = float(match_nums.group(3))
                            
                            if num_total > 0:
                                percent = min(100.0, (num_tried / num_total) * 100)
                                eta_seconds = int((num_total - num_tried) / (num_kps * 1000) if num_kps > 0 else 0)
                                mins, secs = divmod(eta_seconds, 60)
                                eta_str = f"{mins}m {secs}s"
                                
                                bus.publish("job.updated", {
                                    "id": job_id,
                                    "progress": round(percent, 1),
                                    "packetsPerSec": round(num_kps * 1000),
                                    "eta": eta_str
                                })
                        except Exception:
                            pass
                        
                elif topic == "process.exit" and payload.get("job_id") == job_id:
                    # Process died or finished
                    break
                    
        except asyncio.CancelledError:
            pass
        finally:
            if not key_found:
                logger.info("Cracking process ended without finding key.")
                
            if self._running:
                # Stop the job cleanly
                from wcarck.core.event_bus import bus
                bus.publish("job.stop_requested", {"job_id": str(job_id)})
