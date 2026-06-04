from fastapi import APIRouter
from fastapi.responses import HTMLResponse, PlainTextResponse
import time

router = APIRouter(prefix="/api/report", tags=["report"])

@router.get("/csv")
async def get_csv_report():
    import csv
    from io import StringIO
    from wcarck.db.session import SessionLocal
    from wcarck.db.models import Credential
    from sqlalchemy import select
    
    async with SessionLocal() as session:
        result = await session.execute(select(Credential))
        creds = result.scalars().all()
        
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["Time", "SSID", "BSSID", "Type", "Username", "Password"])
        for c in creds:
            writer.writerow([c.captured_at.strftime('%Y-%m-%d %H:%M:%S'), c.network_ssid, c.bssid, c.type, c.username, c.password])
            
        return PlainTextResponse(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=wcarck_report.csv"})

@router.get("/html")
async def get_html_report():
    from wcarck.db.session import SessionLocal
    from wcarck.db.models import Credential
    from sqlalchemy import select
    
    async with SessionLocal() as session:
        result = await session.execute(select(Credential))
        creds = result.scalars().all()
        
        html = """
        <html>
            <head><title>Wcarck Session Report</title>
            <style>body{font-family:sans-serif;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;}</style>
            </head>
            <body>
                <h1>Wcarck Session Report</h1>
                <p>Generated at: """ + time.strftime('%Y-%m-%d %H:%M:%S') + """</p>
                <table>
                    <tr><th>Time</th><th>SSID</th><th>BSSID</th><th>Type</th><th>Username</th><th>Password</th></tr>
        """
        for c in creds:
            html += f"<tr><td>{c.captured_at.strftime('%Y-%m-%d %H:%M:%S')}</td><td>{c.network_ssid}</td><td>{c.bssid}</td><td>{c.type}</td><td>{c.username}</td><td>{c.password}</td></tr>"
        
        html += """
                </table>
            </body>
        </html>
        """
        return HTMLResponse(html)
