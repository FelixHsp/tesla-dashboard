import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getTripById, getTripPositions } from '@/lib/database'
import { getCarById } from '@/lib/car-info'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Zap, 
  Thermometer, 
  BarChart3, 
  Table,
  Navigation,
  Route,
  Gauge,
  Battery,
  Car
} from 'lucide-react'
import TripMap from '@/components/TripMap'
import TripCharts from '@/components/TripCharts'
import DrivingScoreCard from '@/components/DrivingScoreCard'
import { formatDuration, calculateDistance, formatDateWithTimezone } from '@/lib/utils'
import { generateTripTitle } from '@/lib/server-utils'

// 安全的数字格式化函数
function safeToFixed(value: any, digits: number = 1): string {
  const num = Number(value)
  return !isNaN(num) && isFinite(num) ? num.toFixed(digits) : 'N/A'
}

// 计算电量消耗效率
function calculateEfficiency(energyConsumed: number, distance: number): { diff: number; isEfficient: boolean } {
  // 各自先保留一位小数，再做减法
  const roundedEnergyConsumed = Math.round(energyConsumed * 10) / 10
  const roundedDistance = Math.round(distance * 10) / 10
  const diff = roundedEnergyConsumed - roundedDistance
  
  return {
    diff: Math.abs(diff),
    isEfficient: diff <= 0 // 电量消耗小于等于行驶距离则为高效
  }
}

interface TripDetailPageProps {
  params: {
    id: string
  }
}

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  const tripId = parseInt(params.id)
  
  if (isNaN(tripId)) {
    notFound()
  }

  const trip = await getTripById(tripId)
  if (!trip) {
    notFound()
  }

  const positions = await getTripPositions(tripId)
  
  // 获取车辆信息
  const car = await getCarById(trip.car_id)

  const tripTitle = await generateTripTitle(
    trip.start_address,
    trip.end_address,
    trip.start_longitude,
    trip.start_latitude,
    trip.end_longitude,
    trip.end_latitude
  )

  const distance = trip.distance || calculateDistance(trip.start_km, trip.end_km)
  const energyConsumed = trip.start_rated_range_km && trip.end_rated_range_km 
    ? trip.start_rated_range_km - trip.end_rated_range_km 
    : null

  // 计算效率
  const efficiency = distance && energyConsumed 
    ? calculateEfficiency(energyConsumed, distance)
    : null

  return (
    <>
      {/* 行程详情页专用头部，不显示车辆选择器 */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-start gap-4">
            <Link href="/">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-3xl font-bold tracking-tight leading-tight break-words" style={{ fontFamily: 'AlibabaPuHuiTi, sans-serif' }}>{tripTitle}</h1>
            {car && (
              <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                <Car className="h-4 w-4" />
                <span>{car.name || `车辆 ${car.id}`}</span>
              </div>
            )}
          </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8 space-y-4 md:space-y-6">
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          {/* 行程信息卡片 */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: 'AlibabaPuHuiTi, sans-serif' }}>
                <MapPin className="h-5 w-5" />
                行程信息
              </CardTitle>
              <CardDescription className="text-sm">
                {trip.start_date && format(formatDateWithTimezone(trip.start_date), 'yyyy年MM月dd日 HH:mm', { locale: zhCN })}
                {trip.end_date && ` - ${format(formatDateWithTimezone(trip.end_date), 'HH:mm', { locale: zhCN })}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* 第一行：行驶时间和最高速度 */}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">行驶时间</p>
                    <p className="font-medium text-sm">{formatDuration(trip.duration_min)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">最高速度</p>
                    <p className="font-medium text-sm">
                      {trip.speed_max ? `${trip.speed_max} km/h` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* 第二行：行驶距离和电量消耗（含效率） */}
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">行驶距离</p>
                    <p className="font-medium text-sm">
                      {distance ? `${safeToFixed(distance)} km` : 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Battery className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">电量消耗</p>
                    <div className="font-medium text-sm">
                      {energyConsumed ? (
                        <div className="flex items-center gap-1">
                          <span>{safeToFixed(energyConsumed)} km</span>
                          {efficiency && (
                            <span 
                            className={`text-xs ${
                              efficiency.isEfficient ? 'text-green-500' : 'text-red-500'
                            }`}
                          >
                            ({efficiency.isEfficient ? '省' : '耗'}{safeToFixed(efficiency.diff)}km)
                          </span>
                          )}
                        </div>
                      ) : (
                        'N/A'
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 可选的温度和功率信息 */}
              {(trip.outside_temp_avg !== null || trip.inside_temp_avg !== null) && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  {trip.outside_temp_avg !== null && trip.outside_temp_avg !== undefined && (
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">外部温度</p>
                        <p className="font-medium text-sm">{safeToFixed(trip.outside_temp_avg)}°C</p>
                      </div>
                    </div>
                  )}
                  {trip.inside_temp_avg !== null && trip.inside_temp_avg !== undefined && (
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">内部温度</p>
                        <p className="font-medium text-sm">{safeToFixed(trip.inside_temp_avg)}°C</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(trip.power_min !== null || trip.power_max !== null) && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  {trip.power_max !== null && (
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">最大功率</p>
                        <p className="font-medium text-sm">{safeToFixed(trip.power_max)} kW</p>
                      </div>
                    </div>
                  )}
                  {trip.power_min !== null && (
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">最小功率</p>
                        <p className="font-medium text-sm">{safeToFixed(trip.power_min)} kW</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 驾驶评分卡片 */}
        <DrivingScoreCard tripId={tripId} />

        {/* 地图卡片 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg" style={{ fontFamily: 'AlibabaPuHuiTi, sans-serif' }}>行驶轨迹</CardTitle>
            <CardDescription className="text-sm">基于GPS数据的行驶路线</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 md:h-96 rounded-lg overflow-hidden">
              <TripMap positions={positions} />
            </div>
          </CardContent>
        </Card>

        {/* 数据分析标签页 */}
        {positions.length > 0 && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg" style={{ fontFamily: 'AlibabaPuHuiTi, sans-serif' }}>数据分析</CardTitle>
              <CardDescription className="text-sm">行程中的详细数据和趋势分析</CardDescription>
            </CardHeader>
            <CardContent>
              <TripCharts positions={positions} />
            </CardContent>
          </Card>
        )}
      </main>
    </>
  )
} 