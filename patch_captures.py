import os

path = 'frontend/src/pages/Captures.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '''                    <Button
                      variant="outline"
                      size="sm"
                      title="Download .22000 file"
                      className="h-7 w-7 p-0 bg-bg-active border-border-subtle hover:bg-bg-hover"
                    >
                      <Download className="w-3 h-3" />
                    </Button>'''

new = '''                    <Button
                      variant="outline"
                      size="sm"
                      title="Download .22000 file"
                      onClick={() => window.open(`http://127.0.0.1:8000/api/captures/${cap.id}/download`, '_blank')}
                      className="h-7 w-7 p-0 bg-bg-active border-border-subtle hover:bg-bg-hover"
                    >
                      <Download className="w-3 h-3" />
                    </Button>'''

if target in content:
    content = content.replace(target, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Patched Captures.tsx')
else:
    print('Target not found in Captures.tsx')
