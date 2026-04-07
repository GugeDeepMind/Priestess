import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('priestess', {
  platform: process.platform,
  backendUrl: 'http://127.0.0.1:8000',
})
