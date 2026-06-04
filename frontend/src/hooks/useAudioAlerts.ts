import { useEffect, useRef } from 'react'
import { useWcarckStore } from '@/store/useWcarckStore'

export function useAudioAlerts() {
  const audioContext = useRef<AudioContext | null>(null)

  useEffect(() => {
    // We only create the AudioContext if we actually need to play something,
    // to comply with browser autoplay policies.
    const initAudio = () => {
      if (!audioContext.current) {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioContextClass) {
          audioContext.current = new AudioContextClass()
          if (audioContext.current.state === 'suspended') {
            audioContext.current.resume()
          }
        }
      } else if (audioContext.current.state === 'suspended') {
        audioContext.current.resume()
      }
    }

    const playTone = (frequency: number, type: OscillatorType, duration: number, vol = 0.1) => {
      try {
        initAudio()
        if (!audioContext.current) return
        
        const osc = audioContext.current.createOscillator()
        const gain = audioContext.current.createGain()
        
        osc.type = type
        osc.frequency.setValueAtTime(frequency, audioContext.current.currentTime)
        
        gain.gain.setValueAtTime(vol, audioContext.current.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.current.currentTime + duration)
        
        osc.connect(gain)
        gain.connect(audioContext.current.destination)
        
        osc.start()
        osc.stop(audioContext.current.currentTime + duration)
      } catch (e) {
        console.warn('[Wcarck] Audio alert failed:', e)
      }
    }

    initAudio()

    const resumeOnGesture = () => {
      if (audioContext.current?.state === 'suspended') {
        audioContext.current.resume()
      }
    }
    document.addEventListener('click', resumeOnGesture, { once: true, capture: true })
    document.addEventListener('keydown', resumeOnGesture, { once: true, capture: true })

    // Subscribe to store changes
    const unsubCaptures = useWcarckStore.subscribe(
      (state) => state.captures,
      (captures, prevCaptures) => {
        const audioEnabled = useWcarckStore.getState().uiState.audioEnabled
        if (!audioEnabled) return
        
        if (captures.length > prevCaptures.length) {
          // New capture (handshake) - play success chime
          playTone(523.25, 'sine', 0.1) // C5
          setTimeout(() => playTone(659.25, 'sine', 0.3), 100) // E5
        }
      }
    )

    const unsubCredentials = useWcarckStore.subscribe(
      (state) => state.credentials,
      (creds, prevCreds) => {
        const audioEnabled = useWcarckStore.getState().uiState.audioEnabled
        if (!audioEnabled) return

        if (creds.length > prevCreds.length) {
          const latest = creds[0]
          if (latest.valid) {
             // Valid credential - high pitch double beep
             playTone(880, 'square', 0.1, 0.05)
             setTimeout(() => playTone(880, 'square', 0.2, 0.05), 150)
          } else {
             // Invalid credential - low pitch thud
             playTone(150, 'triangle', 0.2, 0.1)
          }
        }
      }
    )

    const unsubLogs = useWcarckStore.subscribe(
      (state) => state.logs,
      (logs, prevLogs) => {
        const audioEnabled = useWcarckStore.getState().uiState.audioEnabled
        if (!audioEnabled) return

        if (logs.length > prevLogs.length) {
          const latest = logs[logs.length - 1]
          if (latest.level === 'ERROR' || latest.level === 'CRITICAL') {
            // Error alert
            playTone(300, 'sawtooth', 0.3, 0.1)
            setTimeout(() => playTone(250, 'sawtooth', 0.5, 0.1), 300)
          }
        }
      }
    )

    return () => {
      unsubCaptures()
      unsubCredentials()
      unsubLogs()
      document.removeEventListener('click', resumeOnGesture)
      document.removeEventListener('keydown', resumeOnGesture)
      if (audioContext.current?.state !== 'closed') {
        audioContext.current?.close()
      }
    }
  }, [])
}
