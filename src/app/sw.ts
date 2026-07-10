import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import { NetworkOnly, Serwist } from "serwist"

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
      // API는 항상 네트워크 — 금전 데이터는 캐시하지 않는다
      matcher: /\/api\//,
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
})

serwist.addEventListeners()
