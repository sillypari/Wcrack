import os

path = 'C:/Users/Parikshit/Desktop/NewGenApps/Wcrack/frontend/src/store/useWcarckStore.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '''          // All events that have a message/level might be logs
          if (event.level && event.message) {
             const logs = [event as LogEntry, ...state.logs].slice(0, MAX_LOGS)
             newState.logs = logs
          }'''

replacement = '''          // Generate logs for UI Terminal
          let logMsg = ''
          let level = 'INFO'
          
          if (event.topic.startsWith('process.stdout')) {
            logMsg = String(event.payload.line || event.payload.message || '')
            level = 'DEBUG'
          } else if (event.topic.startsWith('process.stderr') || event.topic.includes('error') || event.topic === 'job.failed') {
            logMsg = String(event.payload.error || event.payload.message || event.topic)
            level = 'ERROR'
          } else if (event.topic.startsWith('module.') || event.topic.startsWith('system.') || event.topic.startsWith('adapter.')) {
            logMsg = `[${event.topic}] ` + (event.payload.message || event.payload.hint || JSON.stringify(event.payload))
            level = 'INFO'
          }

          if (logMsg) {
             const logEntry: LogEntry = {
               id: `log-${event.seq}`,
               seq: event.seq,
               timestamp: Date.now(),
               level: level as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL',
               channel: 'System' as any,
               event_type: event.topic,
               message: logMsg,
               job_id: null,
               mac_address: null,
               adapter_iface: null,
               payload: event.payload,
               stack_trace: null,
               session_id: 'current'
             }
             const logs = [logEntry, ...state.logs].slice(0, MAX_LOGS)
             newState.logs = logs
          }'''

content = content.replace(target, replacement)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
