import { NextResponse } from 'next/server'
import { getTripPositions, getCachedTripScore, cacheTripScore, getTripById } from '@/lib/database'
import { calculateDrivingScore } from '@/lib/driving-score'
import { z } from 'zod'

const paramsSchema = z.object({
  id: z.string()
})

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 验证参数
    const parsed = paramsSchema.parse(params)
    const tripId = parseInt(parsed.id)

    if (isNaN(tripId)) {
      return NextResponse.json(
        { error: '无效的行程ID' },
        { status: 400 }
      )
    }

    console.log('正在获取行程评分:', { tripId });

    // 1. 先检查缓存
    const cachedScore = await getCachedTripScore(tripId);
    if (cachedScore) {
      console.log('使用缓存的评分:', cachedScore);
      return NextResponse.json({
        tripId,
        dataPoints: cachedScore.data_points,
        score: {
          overall: parseFloat(cachedScore.overall_score.toString()),
          acceleration: parseFloat(cachedScore.acceleration_score.toString()),
          braking: parseFloat(cachedScore.braking_score.toString()),
          smoothness: parseFloat(cachedScore.smoothness_score.toString()),
          efficiency: parseFloat(cachedScore.efficiency_score.toString()),
          details: {
            hardAccelerations: cachedScore.hard_accelerations,
            hardBrakings: cachedScore.hard_brakings,
            rapidSpeedChanges: cachedScore.rapid_speed_changes,
            avgSpeedVariation: parseFloat(cachedScore.avg_speed_variation.toString()),
            powerEfficiency: parseFloat(cachedScore.power_efficiency.toString())
          }
        },
        calculatedAt: cachedScore.updated_at.toISOString(),
        fromCache: true
      })
    }

    // 2. 缓存未命中，获取行程和位置数据并计算
    const [trip, positions] = await Promise.all([
      getTripById(tripId),
      getTripPositions(tripId)
    ]);

    if (!trip || positions.length === 0) {
      return NextResponse.json(
        { error: '未找到行程数据' },
        { status: 404 }
      )
    }

    console.log('获取到位置数据点数:', positions.length);

    // 3. 计算驾驶评分
    const score = calculateDrivingScore(positions, trip)

    console.log('计算完成的评分:', score);

    // 4. 异步缓存评分结果（不等待完成）
    cacheTripScore(tripId, score, positions.length).catch(error => {
      console.error('缓存评分失败:', error);
    });

    return NextResponse.json({
      tripId,
      dataPoints: positions.length,
      score,
      calculatedAt: new Date().toISOString(),
      fromCache: false
    })

  } catch (error: any) {
    console.error('计算驾驶评分失败:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: '参数验证失败', details: error },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: '计算驾驶评分失败', message: error.message },
      { status: 500 }
    )
  }
}