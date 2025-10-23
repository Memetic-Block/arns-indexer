export interface PathManifest {
  manifest: 'arweave/paths'
  version: '0.2.0'
  index: {
    path: string
  }
  fallback: {
    id: string
  }
  paths: {
    [path: string]: {
      id: string
    }
  }
}
