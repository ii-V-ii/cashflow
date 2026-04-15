import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import { Serwist, NetworkOnly } from "serwist"

declare const self: {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
} & SerwistGlobalConfig

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /\/api\//,
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
})

serwist.addEventListeners()
