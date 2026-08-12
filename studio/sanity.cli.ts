import { defineCliConfig } from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'nyd3p2n0',
    dataset: 'production',
  },
  deployment: {
    appId: 't5hs9tn8wrxxyihkxlo77eki',
    autoUpdates: true,
  },
})
