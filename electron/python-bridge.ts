import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'

let pythonProcess: ChildProcess | null = null
const BACKEND_PORT = 8000
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`

function findBackendDir(): string {
  // In development: backend/ is sibling to dist-electron/
  const devPath = path.join(__dirname, '..', 'backend')
  if (fs.existsSync(path.join(devPath, 'run.py'))) {
    return devPath
  }
  // In production (packaged): backend/ is in resources/
  const prodPath = path.join(process.resourcesPath, 'backend')
  if (fs.existsSync(path.join(prodPath, 'run.py'))) {
    return prodPath
  }
  // Fallback
  return devPath
}

export function startPythonBackend(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const alreadyRunning = await checkBackendHealth()
    if (alreadyRunning) {
      console.log('Python backend already running, skipping spawn')
      resolve()
      return
    }

    const backendDir = findBackendDir()
    const runScript = path.join(backendDir, 'run.py')
    console.log('Starting Python backend from:', backendDir)

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
