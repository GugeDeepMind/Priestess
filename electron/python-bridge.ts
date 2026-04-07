import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import http from 'http'

let pythonProcess: ChildProcess | null = null
const BACKEND_PORT = 8000
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`

export function startPythonBackend(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    // Check if backend is already running (e.g., started manually for dev)
    const alreadyRunning = await checkBackendHealth()
    if (alreadyRunning) {
      console.log('Python backend already running, skipping spawn')
      resolve()
      return
    }

    const backendDir = path.join(__dirname, '..', 'backend')
    const runScript = path.join(backendDir, 'run.py')

    pythonProcess = spawn('python', [runScript], {
      cwd: backendDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    pythonProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      console.log('[Python]', text.trim())
      if (text.includes('Application startup complete')) {
        resolve()
      }
    })

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      // uvicorn logs to stderr by default
      console.log('[Python]', text.trim())
      if (text.includes('Application startup complete')) {
        resolve()
      }
    })

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python backend:', err)
      reject(err)
    })

    pythonProcess.on('exit', (code) => {
      console.log('Python backend exited with code:', code)
      pythonProcess = null
    })

    // Timeout: if backend doesn't start in 15s, resolve anyway and retry later
    setTimeout(() => resolve(), 15000)
  })
}

export function stopPythonBackend(): void {
  if (pythonProcess) {
    pythonProcess.kill()
    pythonProcess = null
  }
}

export async function waitForBackend(maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const ok = await checkBackendHealth()
      if (ok) return true
    } catch {
      // ignore
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

function checkBackendHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    http.get(BACKEND_URL, (res) => {
      resolve(res.statusCode === 200)
    }).on('error', () => resolve(false))
  })
}

export { BACKEND_PORT, BACKEND_URL }
