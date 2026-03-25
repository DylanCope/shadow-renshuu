import { useState, useRef, useCallback } from 'react'

export interface RecorderState {
  isRecording: boolean
  duration: number
  error: string | null
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    duration: 0,
    error: null,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resolveRef = useRef<((blob: Blob) => void) | null>(null)
  const rejectRef = useRef<((err: Error) => void) | null>(null)

  const startRecording = useCallback((deviceId?: string): Promise<Blob> => {
    return new Promise(async (resolve, reject) => {
      try {
        // Clear any error from a previous attempt before trying again
        setState(s => ({ ...s, error: null }))

        const audioConstraints: MediaStreamConstraints['audio'] = deviceId
          ? { deviceId: { ideal: deviceId } }
          : true
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })

        // Prefer webm/opus, fall back to whatever the browser supports
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
        mediaRecorderRef.current = recorder
        chunksRef.current = []
        resolveRef.current = resolve
        rejectRef.current = reject

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data)
          }
        }

        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop())
          // Use the recorder's actual mimeType — on iOS Safari the browser picks
          // audio/mp4 and mimeType (our preferred webm) is '' from isTypeSupported.
          const actualType = recorder.mimeType || mimeType || 'audio/webm'
          const blob = new Blob(chunksRef.current, { type: actualType })
          resolveRef.current?.(blob)

          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
          setState({ isRecording: false, duration: 0, error: null })
        }

        recorder.onerror = (e) => {
          rejectRef.current?.(new Error(`Recording error: ${e}`))
          setState((s) => ({ ...s, isRecording: false, error: 'Recording failed' }))
        }

        recorder.start(100) // collect data every 100ms

        let seconds = 0
        timerRef.current = setInterval(() => {
          seconds += 1
          setState((s) => ({ ...s, duration: seconds }))
        }, 1000)

        setState({ isRecording: true, duration: 0, error: null })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Microphone access denied'
        setState({ isRecording: false, duration: 0, error: message })
        reject(new Error(message))
      }
    })
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  return { ...state, startRecording, stopRecording }
}
