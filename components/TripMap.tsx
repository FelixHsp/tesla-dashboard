'use client'

import { useEffect, useRef, useState } from 'react'
import { Position } from '@/lib/database'
import { X, ZoomIn, ZoomOut, Maximize2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { wgs84ToGcj02 } from '@/lib/coordinate-transform'

interface TripMapProps {
  positions: Position[]
}

// 声明全局AMap类型
declare global {
  interface Window {
    AMap: any
    _AMapSecurityConfig: any
    initMap?: () => void
    initFullscreenMap?: () => void
  }
}

export default function TripMap({ positions }: TripMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const fullscreenMapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const fullscreenMapInstance = useRef<any>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // 保存全屏地图初始化的timeout引用
  const fullscreenInitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 创建地图的通用函数
  const createMap = (container: HTMLDivElement, isFullscreenMap = false) => {
    if (!container || positions.length === 0) return null

    // 获取第一个位置点用于设置地图中心
    const firstPos = positions[0];
    const rawCenterLng = typeof firstPos.longitude === 'number' ? firstPos.longitude : parseFloat(firstPos.longitude);
    const rawCenterLat = typeof firstPos.latitude === 'number' ? firstPos.latitude : parseFloat(firstPos.latitude);
    
    // 转换坐标系：WGS84 -> GCJ-02
    const [centerLng, centerLat] = wgs84ToGcj02(rawCenterLat, rawCenterLng);

    const map = new window.AMap.Map(container, {
      zoom: 13,
      center: [centerLng, centerLat],
      mapStyle: 'amap://styles/normal',
      zoomEnable: isFullscreenMap, // 全屏模式启用缩放
      dragEnable: isFullscreenMap, // 全屏模式启用拖拽
    })

    // 创建轨迹点数组，直接使用原始值以保持精度，并转换坐标系
    const path = positions.map(pos => {
      const rawLng = typeof pos.longitude === 'number' ? pos.longitude : parseFloat(pos.longitude);
      const rawLat = typeof pos.latitude === 'number' ? pos.latitude : parseFloat(pos.latitude);
      // 转换坐标系：WGS84 -> GCJ-02
      const [gcjLng, gcjLat] = wgs84ToGcj02(rawLat, rawLng);
      return [gcjLng, gcjLat];
    });

    // 添加起点标记
    const rawStartLng = typeof firstPos.longitude === 'number' ? firstPos.longitude : parseFloat(firstPos.longitude);
    const rawStartLat = typeof firstPos.latitude === 'number' ? firstPos.latitude : parseFloat(firstPos.latitude);
    // 转换坐标系：WGS84 -> GCJ-02
    const [startLng, startLat] = wgs84ToGcj02(rawStartLat, rawStartLng);
    
    const startMarker = new window.AMap.Marker({
      position: [startLng, startLat],
      title: '起点',
      icon: new window.AMap.Icon({
        size: new window.AMap.Size(20, 26),
        image: '//a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-default.png',
        imageSize: new window.AMap.Size(20, 26),
      }),
      offset: new window.AMap.Pixel(-9, -23),
    })

    // 添加终点标记
    if (positions.length > 1) {
      const lastPos = positions[positions.length - 1];
      const rawEndLng = typeof lastPos.longitude === 'number' ? lastPos.longitude : parseFloat(lastPos.longitude);
      const rawEndLat = typeof lastPos.latitude === 'number' ? lastPos.latitude : parseFloat(lastPos.latitude);
      // 转换坐标系：WGS84 -> GCJ-02
      const [endLng, endLat] = wgs84ToGcj02(rawEndLat, rawEndLng);
      
      const endMarker = new window.AMap.Marker({
        position: [endLng, endLat],
        title: '终点',
        icon: new window.AMap.Icon({
          size: new window.AMap.Size(20, 26),
          image: '//a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-red.png',
          imageSize: new window.AMap.Size(20, 26),
        }),
        offset: new window.AMap.Pixel(-9, -23),
      })
      map.add(endMarker)
    }

    map.add(startMarker)

    // 绘制轨迹线
    const polyline = new window.AMap.Polyline({
      path: path,
      borderWeight: 5,
      strokeColor: '#1890ff',
      strokeWeight: 4,
      strokeOpacity: 0.8,
      lineJoin: 'round',
      lineCap: 'round',
    })

    map.add(polyline)

    // 自适应显示轨迹
    map.setFitView([startMarker, polyline])

    return map
  }

  // 刷新地图函数
  const refreshMap = () => {
    if (mapInstance.current && mapRef.current) {
      mapInstance.current.destroy();
      mapInstance.current = createMap(mapRef.current, false);
    }
    
    if (fullscreenMapInstance.current && fullscreenMapRef.current) {
      fullscreenMapInstance.current.destroy();
      fullscreenMapInstance.current = createMap(fullscreenMapRef.current, true);
    }
  }

  useEffect(() => {
    // 设置高德地图安全密钥
    window._AMapSecurityConfig = {
      securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE || '',
    }

    // 动态加载高德地图API
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=1.4.15&key=${process.env.NEXT_PUBLIC_AMAP_KEY}&callback=initMap`
    script.async = true
    
    // 初始化小地图
    window.initMap = () => {
      if (mapRef.current) {
        mapInstance.current = createMap(mapRef.current, false)
      }
    }

    // 初始化全屏地图
    window.initFullscreenMap = () => {
      if (fullscreenMapRef.current) {
        fullscreenMapInstance.current = createMap(fullscreenMapRef.current, true)
      }
    }

    document.head.appendChild(script)

    return () => {
      // 清理
      if (mapInstance.current) {
        mapInstance.current.destroy()
      }
      if (fullscreenMapInstance.current) {
        fullscreenMapInstance.current.destroy()
      }
      // 清理全屏地图初始化的timeout
      if (fullscreenInitTimeoutRef.current) {
        clearTimeout(fullscreenInitTimeoutRef.current)
      }
      delete window.initMap
      delete window.initFullscreenMap
      const scriptToRemove = document.querySelector(`script[src*="webapi.amap.com"]`)
      if (scriptToRemove && document.head.contains(scriptToRemove)) {
        document.head.removeChild(scriptToRemove)
      }
    }
  }, [positions])

  // 打开全屏地图
  const openFullscreen = () => {
    setIsFullscreen(true)
    // 延迟初始化全屏地图，确保DOM已渲染
    fullscreenInitTimeoutRef.current = setTimeout(() => {
      if (window.AMap && fullscreenMapRef.current) {
        fullscreenMapInstance.current = createMap(fullscreenMapRef.current, true)
      }
    }, 100)
  }

  // 关闭全屏地图
  const closeFullscreen = () => {
    // 清理全屏地图初始化的timeout
    if (fullscreenInitTimeoutRef.current) {
      clearTimeout(fullscreenInitTimeoutRef.current)
      fullscreenInitTimeoutRef.current = null
    }
    
    if (fullscreenMapInstance.current) {
      fullscreenMapInstance.current.destroy()
      fullscreenMapInstance.current = null
    }
    setIsFullscreen(false)
  }

  // 缩放控制
  const zoomIn = () => {
    if (fullscreenMapInstance.current) {
      fullscreenMapInstance.current.zoomIn()
    }
  }

  const zoomOut = () => {
    if (fullscreenMapInstance.current) {
      fullscreenMapInstance.current.zoomOut()
    }
  }

  if (positions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <p className="text-muted-foreground">暂无轨迹数据</p>
      </div>
    )
  }

  return (
    <>
      {/* 小地图 */}
      <div className="relative w-full h-full group">
        <div ref={mapRef} className="w-full h-full rounded-lg overflow-hidden" />
        
        {/* 点击遮罩 - 避开按钮区域 */}
        <div 
          className="absolute inset-0 cursor-pointer"
          style={{ right: '100px' }} // 避开按钮区域
          onClick={openFullscreen}
          title="点击放大地图"
        />
        
        {/* 刷新按钮 */}
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-2 right-12 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => {
            e.stopPropagation() // 阻止事件冒泡
            refreshMap()
          }}
          title="刷新地图"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        
        {/* 放大按钮 */}
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => {
            e.stopPropagation() // 阻止事件冒泡
            openFullscreen()
          }}
          title="放大地图"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* 全屏模态 */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="relative w-full h-full max-w-6xl max-h-full bg-white rounded-lg overflow-hidden">
            {/* 控制按钮 */}
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <Button variant="secondary" size="sm" onClick={zoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={zoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={closeFullscreen}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* 全屏地图容器 */}
            <div ref={fullscreenMapRef} className="w-full h-full" />
          </div>
        </div>
      )}
    </>
  )
}