import asyncio
import os
import re
import json
import structlog
from typing import Tuple, Dict, Any

logger = structlog.get_logger()

async def verify_handshake(pcap_path: str) -> Tuple[str, str]:
    if not os.path.exists(pcap_path):
        return "Invalid", ""

    if os.name == 'nt':
        return "Valid", ""

    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "aircrack-ng", pcap_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(input=b"1\n"), timeout=5.0)
        output = stdout.decode('utf-8', errors='ignore')

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


async def parse_eapol_frames(pcap_path: str) -> Dict[str, Any]:
    if not os.path.exists(pcap_path):
        return {"m1": False, "m2": False, "m3": False, "m4": False, "pmkid": False}

    if os.name == 'nt':
        return {"m1": True, "m2": True, "m3": False, "m4": False, "pmkid": False}

    result = {"m1": False, "m2": False, "m3": False, "m4": False, "pmkid": False}

    try:
        proc = await asyncio.create_subprocess_exec(
            "tshark", "-r", pcap_path,
            "-T", "json",
            "-Y", "eapol",
            "-e", "wlan.sa",
            "-e", "wlan.da",
            "-e", "eapol.keydes.type",
            "-e", "wsm.keydes.key_info",
            "-e", "wlan_rsn.eapol_pmkid",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15.0)
        raw = stdout.decode('utf-8', errors='ignore').strip()

        if not raw:
            result = await _parse_eapol_legacy(pcap_path)
            return result

        # Guard: reject absurdly large tshark output (>50MB) to prevent OOM
        if len(raw) > 50 * 1024 * 1024:
            logger.warning(f"tshark output too large ({len(raw)} bytes) for {pcap_path}, falling back to legacy")
            result = await _parse_eapol_legacy(pcap_path)
            return result

        try:
            frames = json.loads(raw)
        except json.JSONDecodeError:
            result = await _parse_eapol_legacy(pcap_path)
            return result

        for frame in frames:
            layers = frame.get("_source", {}).get("layers", {})
            pmkid_val = layers.get("wlan_rsn.eapol_pmkid", "")
            if pmkid_val and pmkid_val != "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00":
                result["pmkid"] = True

            key_info = layers.get("wsm.keydes.key_info", "")
            key_type = layers.get("eapol.keydes.type", "")

            if isinstance(key_info, str) and key_info:
                ki = int(key_info, 16) if key_info.startswith("0x") else int(key_info)
                is_request = (ki & 0x0080) != 0
                key_descriptor = ki & 0x0007

                if is_request and key_descriptor in (1, 2):
                    m_num = (ki >> 3) & 0x03
                    if m_num == 0:
                        result["m1"] = True
                    elif m_num == 2:
                        result["m3"] = True
                elif not is_request and key_descriptor in (1, 2):
                    m_num = (ki >> 3) & 0x03
                    if m_num == 1:
                        result["m2"] = True
                    elif m_num == 3:
                        result["m4"] = True

    except asyncio.TimeoutError:
        logger.warning(f"tshark timed out parsing {pcap_path}")
        result = await _parse_eapol_legacy(pcap_path)
    except FileNotFoundError:
        logger.warning("tshark not found, using legacy EAPOL detection")
        result = await _parse_eapol_legacy(pcap_path)
    except Exception as e:
        logger.error(f"EAPOL parse error: {e}")
        result = await _parse_eapol_legacy(pcap_path)

    return result


async def _parse_eapol_legacy(pcap_path: str) -> Dict[str, Any]:
    result = {"m1": False, "m2": False, "m3": False, "m4": False, "pmkid": False}

    try:
        proc = await asyncio.create_subprocess_exec(
            "aircrack-ng", pcap_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(input=b"1\n"), timeout=5.0)
        output = stdout.decode('utf-8', errors='ignore')

        if "handshake" in output or "with PMKID" in output:
            result["m1"] = True
            result["m2"] = True
        if "PMKID" in output:
            result["pmkid"] = True

    except Exception:
        pass

    return result


async def convert_to_hashcat(pcapng_path: str, output_path: str) -> bool:
    if not os.path.exists(pcapng_path):
        return False

    if os.name == 'nt':
        return False

    try:
        proc = await asyncio.create_subprocess_exec(
            "hcxpcapngtool", "-o", output_path, pcapng_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)

        if proc.returncode == 0 and os.path.exists(output_path):
            size = os.path.getsize(output_path)
            if size > 0:
                return True

        err_text = stderr.decode('utf-8', errors='ignore')
        logger.warning(f"hcxpcapngtool failed (rc={proc.returncode}): {err_text[:200]}")
        return False

    except FileNotFoundError:
        logger.warning("hcxpcapngtool not found — cannot convert to hashcat format")
        return False
    except asyncio.TimeoutError:
        logger.warning("hcxpcapngtool timed out")
        return False
    except Exception as e:
        logger.error(f"hcxpcapngtool conversion error: {e}")
        return False


async def strip_with_wpaclean(src_path: str, dst_path: str) -> Tuple[bool, int, int]:
    if not os.path.exists(src_path):
        return False, 0, 0

    original_size = os.path.getsize(src_path)

    if os.name == 'nt':
        import shutil
        shutil.copyfile(src_path, dst_path)
        return True, original_size, original_size

    try:
        proc = await asyncio.create_subprocess_exec(
            "wpaclean", dst_path, src_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await asyncio.wait_for(proc.communicate(), timeout=10.0)

        if os.path.exists(dst_path) and os.path.getsize(dst_path) > 0:
            new_size = os.path.getsize(dst_path)
            return True, original_size, new_size

        return False, original_size, 0

    except Exception as e:
        logger.info(f"wpaclean failed: {e}")
        return False, original_size, 0
