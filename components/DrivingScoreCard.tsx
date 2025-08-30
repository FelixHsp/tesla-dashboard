'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Trophy, 
  ArrowUp, 
  ArrowDown, 
  TrendingUp, 
  Battery,
  Activity
} from 'lucide-react'
import { useEffect, useState } from 'react'

interface DrivingScore {
  overall: number
  acceleration: number
  braking: number
  smoothness: number
  efficiency: number
  details: {
    hardAccelerations: number
    hardBrakings: number
    rapidSpeedChanges: number
    avgSpeedVariation: number
    powerEfficiency: number
  }
}

interface DrivingScoreResponse {
  tripId: number
  dataPoints: number
  score: DrivingScore
  calculatedAt: string
}

interface DrivingScoreCardProps {
  tripId: number
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-500'
  if (score >= 80) return 'text-blue-500'
  if (score >= 70) return 'text-yellow-500'
  if (score >= 60) return 'text-orange-500'
  return 'text-red-500'
}

function getScoreLevel(score: number): string {
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 70) return '一般'
  return '需改进'
}

export default function DrivingScoreCard({ tripId }: DrivingScoreCardProps) {
  const [scoreData, setScoreData] = useState<DrivingScoreResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchScore() {
      try {
        const response = await fetch(`/api/trips/${tripId}/score`)
        if (!response.ok) {
          throw new Error('获取评分失败')
        }
        const data = await response.json()
        setScoreData(data)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchScore()
  }, [tripId])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: 'AlibabaPuHuiTi, sans-serif' }}>
            <Trophy className="h-5 w-5" />
            驾驶评分
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <div className="text-sm text-muted-foreground">正在计算评分...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !scoreData) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: 'AlibabaPuHuiTi, sans-serif' }}>
            <Trophy className="h-5 w-5" />
            驾驶评分
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <div className="text-sm text-muted-foreground">
              {error || '无法计算评分'}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { score } = scoreData
  const level = getScoreLevel(score.overall)

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: 'AlibabaPuHuiTi, sans-serif' }}>
            <Trophy className="h-5 w-5" />
            驾驶评分
          </CardTitle>
          <div className={`text-lg font-bold ${getScoreColor(score.overall)}`}>
            {score.overall.toFixed(1)}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{level}</span>
          <span className="text-xs text-muted-foreground">
            {scoreData.dataPoints} 个数据点
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 第一行：急加速次数 和 加速表现 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <ArrowUp className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">急加速次数</p>
              <p className="font-medium text-sm text-black">
                {score.details.hardAccelerations} 次
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <ArrowUp className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">加速表现</p>
              <p className={`font-medium text-sm ${getScoreColor(score.acceleration)}`}>
                {score.acceleration.toFixed(1)}
              </p>
            </div>
          </div>
        </div>

        {/* 第二行：急刹车次数 和 制动表现 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">急刹车次数</p>
              <p className="font-medium text-sm text-black">
                {score.details.hardBrakings} 次
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">制动表现</p>
              <p className={`font-medium text-sm ${getScoreColor(score.braking)}`}>
                {score.braking.toFixed(1)}
              </p>
            </div>
          </div>
        </div>

        {/* 第三行：平均速度变化 和 驾驶平稳性 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">平均速度变化率</p>
              <p className="font-medium text-sm text-black">
                {score.details.avgSpeedVariation.toFixed(1)} (km/h)/s
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">驾驶平稳性</p>
              <p className={`font-medium text-sm ${getScoreColor(score.smoothness)}`}>
                {score.smoothness.toFixed(1)}
              </p>
            </div>
          </div>
        </div>

        {/* 第四行：能效数据 和 能效表现 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Battery className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">能效比率</p>
              <p className="font-medium text-sm text-black">
                {score.details.powerEfficiency > 0 ? score.details.powerEfficiency.toFixed(2) : 'N/A'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Battery className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">能效表现</p>
              <p className={`font-medium text-sm ${getScoreColor(score.efficiency)}`}>
                {score.efficiency.toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}