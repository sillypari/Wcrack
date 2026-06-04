from fastapi import APIRouter
from fastapi.responses import HTMLResponse, PlainTextResponse
import time

router = APIRouter(prefix="/api/report", tags=["report"])

@router.get("/csv")
async def get_csv_report():
    # Dummy CSV generation for MVP
    csv_content = "Time,Type,Target,Status\n"
    csv_content += f"{time.strftime('%Y-%m-%d %H:%M:%S')},Deauth,NASA,Success\n"
    return PlainTextResponse(csv_content, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=wcarck_report.csv"})

@router.get("/html")
async def get_html_report():
    # Dummy HTML generation for MVP
    html_content = """
    <html>
        <head><title>Wcarck Session Report</title></head>
        <body>
            <h1>Wcarck Session Report</h1>
            <p>Generated at: """ + time.strftime('%Y-%m-%d %H:%M:%S') + """</p>
            <table border="1">
                <tr><th>Time</th><th>Type</th><th>Target</th><th>Status</th></tr>
                <tr><td>""" + time.strftime('%Y-%m-%d %H:%M:%S') + """</td><td>Deauth</td><td>NASA</td><td>Success</td></tr>
            </table>
        </body>
    </html>
    """
    return HTMLResponse(html_content)
