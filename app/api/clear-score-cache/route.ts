import { NextResponse } from 'next/server'
import { pool } from '@/lib/database'

export async function DELETE() {
  try {
    if (process.env.SKIP_DB_CONNECTION === 'true') {
      return NextResponse.json({ message: '数据库连接已跳过，无需清理' })
    }

    const client = await pool.connect()
    try {
      // 清空trip_driving_scores表的数据
      const result = await client.query('DELETE FROM trip_driving_scores')
      console.log(`已清除 ${result.rowCount} 条驾驶评分缓存记录`)
      
      return NextResponse.json({ 
        message: '驾驶评分缓存已清除',
        deletedCount: result.rowCount,
        note: '下次查询评分时会重新计算'
      })
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('清除驾驶评分缓存失败:', error)
    return NextResponse.json(
      { error: '清除评分缓存失败', message: error.message },
      { status: 500 }
    )
  }
}