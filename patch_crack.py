import os

path = 'frontend/src/pages/Crack.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add fetchWordlists
target1 = '''  const { captures, activeJobs, startJob, stopJob } = useWcarckStore()'''
new1 = '''  const { captures, activeJobs, startJob, stopJob, wordlists, fetchWordlists } = useWcarckStore()
  
  React.useEffect(() => {
    fetchWordlists()
  }, [fetchWordlists])'''
content = content.replace(target1, new1)

# Replace options
target2 = '''                <option value="rockyou.txt">rockyou.txt (14,344,392 words)</option>
                <option value="top1000.txt">top1000.txt (1,000 words - fast)</option>
                <option value="custom">Custom wordlist...</option>'''
new2 = '''                {wordlists.map(w => (
                  <option key={w.name} value={w.path}>{w.name} ({(w.size / 1024 / 1024).toFixed(2)} MB)</option>
                ))}
                <option value="custom">Upload Custom Wordlist...</option>'''
content = content.replace(target2, new2)

# Replace mock stats
target3 = '''<div className="font-mono text-xs font-semibold text-text-primary">{crackJob ? "42.1 kH/s" : "0 H/s"}</div>'''
new3 = '''<div className="font-mono text-xs font-semibold text-text-primary">{crackJob ? (crackJob.speed || "Starting...") : "0 H/s"}</div>'''
content = content.replace(target3, new3)

target4 = '''<div className="font-mono text-xs font-semibold text-text-primary">{crackJob ? "2m 14s" : "--:--"}</div>'''
new4 = '''<div className="font-mono text-xs font-semibold text-text-primary">{crackJob ? (crackJob.eta || "Calculating...") : "--:--"}</div>'''
content = content.replace(target4, new4)

target5 = '''                  {crackJob ? "Running dictionary attack (Wordlist mode)" : "Idle"}'''
new5 = '''                  {crackJob ? (crackJob.status_message || "Running dictionary attack (Wordlist mode)") : "Idle"}'''
content = content.replace(target5, new5)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Patched Crack.tsx')
