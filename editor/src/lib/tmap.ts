import type { PoiType } from '../types'

declare global {
  interface Window {
    TMap?: any
  }
}

let tmapLoadPromise: Promise<any> | null = null

function buildScriptUrl(key: string): string {
  const scriptUrl = new URL('https://map.qq.com/api/gljs')
  scriptUrl.searchParams.set('v', '1.exp')
  scriptUrl.searchParams.set('key', key)
  return scriptUrl.toString()
}

export function loadTencentMap(key: string): Promise<any> {
  if (!key) {
    return Promise.reject(new Error('没有读取到腾讯地图 Key。请检查 editor/.env.local 里的 VITE_TMAP_KEY。'))
  }

  if (typeof window === 'undefined') {
    return Promise.reject(new Error('当前环境不是浏览器，无法加载腾讯地图。'))
  }

  if (window.TMap) {
    return Promise.resolve(window.TMap)
  }

  if (tmapLoadPromise) {
    return tmapLoadPromise
  }

  tmapLoadPromise = new Promise((resolve, reject) => {
    const existed = document.querySelector<HTMLScriptElement>('script[data-tmap-script="true"]')

    if (existed) {
      existed.addEventListener('load', () => resolve(window.TMap))
      existed.addEventListener('error', () => reject(new Error('腾讯地图脚本加载失败。')))
      return
    }

    const script = document.createElement('script')
    script.charset = 'utf-8'
    script.async = true
    script.src = buildScriptUrl(key)
    script.dataset.tmapScript = 'true'
    script.onload = () => {
      if (!window.TMap) {
        reject(new Error('腾讯地图脚本已返回，但没有拿到 TMap 对象。请检查 Key 和域名白名单。'))
        return
      }

      resolve(window.TMap)
    }
    script.onerror = () => reject(new Error('腾讯地图脚本加载失败。请检查网络、Key 和域名白名单。'))
    document.body.appendChild(script)
  })

  return tmapLoadPromise
}

function svgDataUri(fill: string, stroke: string, size = 48): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="16" fill="${fill}" stroke="${stroke}" stroke-width="4" />
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function markerFillColor(type: PoiType, active = false): string {
  if (active) {
    return '#d4612e'
  }

  switch (type) {
    case 'start':
      return '#2b6f5f'
    case 'end':
      return '#7d5d54'
    case 'service':
      return '#1f7a8c'
    case 'guide':
      return '#9d7e2e'
    case 'junction':
      return '#8b4f8a'
    case 'scenic':
    default:
      return '#cf6f3c'
  }
}

export function buildMarkerStyleMap(TMap: any): Record<string, any> {
  const markerTypes: PoiType[] = ['start', 'end', 'service', 'guide', 'junction', 'scenic']
  const styles: Record<string, any> = {}

  markerTypes.forEach((type) => {
    styles[type] = new TMap.MarkerStyle({
      width: 42,
      height: 42,
      anchor: { x: 21, y: 21 },
      src: svgDataUri(markerFillColor(type), '#17343d', 48)
    })

    styles[`${type}-active`] = new TMap.MarkerStyle({
      width: 54,
      height: 54,
      anchor: { x: 27, y: 27 },
      src: svgDataUri(markerFillColor(type, true), '#fff7e8', 60)
    })
  })

  styles.routeVertex = new TMap.MarkerStyle({
    width: 14,
    height: 14,
    anchor: { x: 7, y: 7 },
    src: svgDataUri('#ffe8b8', '#17343d', 20)
  })

  styles['routeVertex-active'] = new TMap.MarkerStyle({
    width: 22,
    height: 22,
    anchor: { x: 11, y: 11 },
    src: svgDataUri('#d4612e', '#fff7e8', 28)
  })

  return styles
}

export function buildPolylineStyles(TMap: any): Record<string, any> {
  return {
    routeShadow: new TMap.PolylineStyle({
      color: '#f4faf7',
      width: 12,
      borderWidth: 0,
      lineCap: 'round'
    }),
    routeMain: new TMap.PolylineStyle({
      color: '#245f6d',
      width: 7,
      borderWidth: 0,
      lineCap: 'round'
    })
  }
}
