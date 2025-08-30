import { Pool, PoolClient } from 'pg'
import { getAddressesWithCache } from './address-cache'
import { simplifyAddress } from './utils'
import { wgs84ToGcj02 } from './coordinate-transform'

// 数据库连接配置
let pool: Pool;

// 只在运行时创建数据库连接池，构建时跳过
if (process.env.SKIP_DB_CONNECTION !== 'true') {
  pool = new Pool({
    user: process.env.DB_USER || 'teslamate',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'teslamate',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432'),
  });
} else {
  // 构建时使用空对象
  pool = {} as Pool;
}

export { pool }

// 时区配置
export const TIMEZONE = process.env.TZ || process.env.TIMEZONE || 'Asia/Shanghai'

// 行程数据类型定义 (基于TeslaMate的drives表)
export interface Trip {
  id: number
  start_date: Date
  end_date: Date | null
  start_address_id: number | null
  end_address_id: number | null
  start_geofence_id: number | null
  end_geofence_id: number | null
  start_km: number | null
  end_km: number | null
  start_address: string | null
  end_address: string | null
  distance: number | null
  duration_min: number | null
  outside_temp_avg: number | null
  inside_temp_avg: number | null
  speed_max: number | null
  power_max: number | null
  power_min: number | null
  start_ideal_range_km: number | null
  end_ideal_range_km: number | null
  start_rated_range_km: number | null
  end_rated_range_km: number | null
  car_id: number
  // 新增坐标字段
  start_latitude: number | null
  start_longitude: number | null
  end_latitude: number | null
  end_longitude: number | null
  // 新增详细地址字段（从高德地图API批量获取）
  start_detailed_address?: string | null
  end_detailed_address?: string | null
  trip_title?: string | null
}

// 位置数据类型定义
export interface Position {
  id: number
  date: Date
  latitude: number | string
  longitude: number | string
  speed: number | null
  power: number | null
  odometer: number | null
  ideal_battery_range_km: number | null
  battery_level: number | null
  outside_temp: number | null
  inside_temp: number | null
  drive_id: number
}

// 分页查询结果类型
export interface PaginatedTrips {
  trips: Trip[]
  hasMore: boolean
  total: number
}

// 坐标地址缓存数据类型
export interface CoordinateAddress {
  id: number
  longitude: number
  latitude: number
  address: string
  created_at: Date
  updated_at: Date
}

// 驾驶评分缓存数据类型
export interface TripDrivingScore {
  id: number
  trip_id: number
  overall_score: number
  acceleration_score: number
  braking_score: number
  smoothness_score: number
  efficiency_score: number
  hard_accelerations: number
  hard_brakings: number
  rapid_speed_changes: number
  avg_speed_variation: number
  power_efficiency: number
  data_points: number
  created_at: Date
  updated_at: Date
}

// 创建坐标地址缓存表
export async function createCoordinateAddressesTable(): Promise<void> {
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return;
  }

  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS coordinate_addresses (
        id SERIAL PRIMARY KEY,
        longitude DECIMAL(10, 7) NOT NULL,
        latitude DECIMAL(10, 7) NOT NULL,
        address VARCHAR(500) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(longitude, latitude)
      )
    `);

    // 添加联合索引以提高查询效率
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_coordinate_addresses_coords 
      ON coordinate_addresses (longitude, latitude)
    `);

    console.log('坐标地址缓存表创建成功');
  } catch (error) {
    console.error('创建坐标地址缓存表失败:', error);
    throw error;
  } finally {
    client.release()
  }
}

// 创建驾驶评分缓存表
export async function createTripScoresTable(): Promise<void> {
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return;
  }

  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS trip_driving_scores (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL,
        overall_score DECIMAL(5, 2) NOT NULL,
        acceleration_score DECIMAL(5, 2) NOT NULL,
        braking_score DECIMAL(5, 2) NOT NULL,
        smoothness_score DECIMAL(5, 2) NOT NULL,
        efficiency_score DECIMAL(5, 2) NOT NULL,
        hard_accelerations INTEGER NOT NULL DEFAULT 0,
        hard_brakings INTEGER NOT NULL DEFAULT 0,
        rapid_speed_changes INTEGER NOT NULL DEFAULT 0,
        avg_speed_variation DECIMAL(8, 2) NOT NULL DEFAULT 0,
        power_efficiency DECIMAL(8, 2) NOT NULL DEFAULT 0,
        data_points INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(trip_id)
      )
    `);

    // 添加trip_id索引以提高查询效率
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_trip_driving_scores_trip_id 
      ON trip_driving_scores (trip_id)
    `);

    console.log('驾驶评分缓存表创建成功');
  } catch (error) {
    console.error('创建驾驶评分缓存表失败:', error);
    throw error;
  } finally {
    client.release()
  }
}

// 获取缓存的地址信息
export async function getCachedAddress(longitude: number, latitude: number): Promise<string | null> {
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return null;
  }

  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT address FROM coordinate_addresses WHERE longitude = $1 AND latitude = $2',
      [longitude, latitude]
    );
    return result.rows[0]?.address || null;
  } catch (error) {
    console.error('查询缓存地址失败:', error);
    return null;
  } finally {
    client.release()
  }
}

// 缓存地址信息
export async function cacheAddress(longitude: number, latitude: number, address: string): Promise<void> {
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return;
  }

  const client = await pool.connect()
  try {
    await client.query(`
      INSERT INTO coordinate_addresses (longitude, latitude, address, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (longitude, latitude)
      DO UPDATE SET address = EXCLUDED.address, updated_at = NOW()
    `, [longitude, latitude, address]);
  } catch (error) {
    console.error('缓存地址失败:', error);
    // 不抛出错误，因为缓存失败不应该影响主功能
  } finally {
    client.release()
  }
}

// 获取缓存的驾驶评分
export async function getCachedTripScore(tripId: number): Promise<TripDrivingScore | null> {
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return null;
  }

  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM trip_driving_scores WHERE trip_id = $1',
      [tripId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('查询缓存评分失败:', error);
    return null;
  } finally {
    client.release()
  }
}

// 缓存驾驶评分信息
export async function cacheTripScore(tripId: number, score: any, dataPoints: number): Promise<void> {
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return;
  }

  const client = await pool.connect()
  try {
    await client.query(`
      INSERT INTO trip_driving_scores (
        trip_id, overall_score, acceleration_score, braking_score, 
        smoothness_score, efficiency_score, hard_accelerations, 
        hard_brakings, rapid_speed_changes, avg_speed_variation, 
        power_efficiency, data_points, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (trip_id)
      DO UPDATE SET
        overall_score = EXCLUDED.overall_score,
        acceleration_score = EXCLUDED.acceleration_score,
        braking_score = EXCLUDED.braking_score,
        smoothness_score = EXCLUDED.smoothness_score,
        efficiency_score = EXCLUDED.efficiency_score,
        hard_accelerations = EXCLUDED.hard_accelerations,
        hard_brakings = EXCLUDED.hard_brakings,
        rapid_speed_changes = EXCLUDED.rapid_speed_changes,
        avg_speed_variation = EXCLUDED.avg_speed_variation,
        power_efficiency = EXCLUDED.power_efficiency,
        data_points = EXCLUDED.data_points,
        updated_at = NOW()
    `, [
      tripId,
      score.overall,
      score.acceleration,
      score.braking,
      score.smoothness,
      score.efficiency,
      score.details.hardAccelerations,
      score.details.hardBrakings,
      score.details.rapidSpeedChanges,
      score.details.avgSpeedVariation,
      score.details.powerEfficiency,
      dataPoints
    ]);
  } catch (error) {
    console.error('缓存评分失败:', error);
    // 不抛出错误，因为缓存失败不应该影响主功能
  } finally {
    client.release()
  }
}

// 获取行程列表 (使用TeslaMate的drives表) - 保持原有功能
export async function getTrips(carId?: number): Promise<Trip[]> {
  // 构建时返回空数组
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return [];
  }
  
  const client = await pool.connect()
  try {
    let query = `
      SELECT 
        d.id,
        d.start_date,
        d.end_date,
        d.start_address_id,
        d.end_address_id,
        d.start_geofence_id,
        d.end_geofence_id,
        d.start_km,
        d.end_km,
        d.distance,
        d.duration_min,
        d.outside_temp_avg,
        d.inside_temp_avg,
        d.speed_max,
        d.power_max,
        d.power_min,
        d.start_ideal_range_km,
        d.end_ideal_range_km,
        d.start_rated_range_km,
        d.end_rated_range_km,
        d.car_id,
        COALESCE(start_geofence.name, 
          CONCAT_WS(', ', 
            COALESCE(start_address.name, 
              NULLIF(CONCAT_WS(' ', start_address.road, start_address.house_number), '')
            ), 
            start_address.city
          )
        ) AS start_address,
        COALESCE(end_geofence.name, 
          CONCAT_WS(', ', 
            COALESCE(end_address.name, 
              NULLIF(CONCAT_WS(' ', end_address.road, end_address.house_number), '')
            ), 
            end_address.city
          )
        ) AS end_address,
        -- 获取起始坐标（行程第一个位置点）
        start_pos.latitude AS start_latitude,
        start_pos.longitude AS start_longitude,
        -- 获取结束坐标（行程最后一个位置点）
        end_pos.latitude AS end_latitude,
        end_pos.longitude AS end_longitude
      FROM drives d
      LEFT JOIN addresses start_address ON d.start_address_id = start_address.id
      LEFT JOIN addresses end_address ON d.end_address_id = end_address.id
      LEFT JOIN geofences start_geofence ON d.start_geofence_id = start_geofence.id
      LEFT JOIN geofences end_geofence ON d.end_geofence_id = end_geofence.id
      -- 获取起始位置坐标
      LEFT JOIN LATERAL (
        SELECT latitude, longitude 
        FROM positions 
        WHERE drive_id = d.id 
        ORDER BY date ASC 
        LIMIT 1
      ) start_pos ON true
      -- 获取结束位置坐标
      LEFT JOIN LATERAL (
        SELECT latitude, longitude 
        FROM positions 
        WHERE drive_id = d.id 
        ORDER BY date DESC 
        LIMIT 1
      ) end_pos ON true
      WHERE d.end_date IS NOT NULL
    `;
    
    const params: any[] = [];
    
    // 如果指定了车辆ID，则添加过滤条件
    if (carId !== undefined) {
      query += ` AND d.car_id = $1`;
      params.push(carId);
    }
    
    query += ` ORDER BY d.start_date DESC LIMIT 50`;
    
    const result = await client.query(query, params);
    return result.rows
  } finally {
    client.release()
  }
}

// 分页获取行程列表
export async function getTripsPaginated(page: number = 1, limit: number = 10, carId?: number): Promise<PaginatedTrips> {
  // 构建时返回空数据
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return {
      trips: [],
      hasMore: false,
      total: 0
    };
  }
  
  const client = await pool.connect()
  try {
    const offset = (page - 1) * limit
    
    // 获取总数
    let countQuery = `
      SELECT COUNT(*) as total
      FROM drives d
      WHERE d.end_date IS NOT NULL
    `;
    const countParams: any[] = [];
    
    // 如果指定了车辆ID，则添加过滤条件
    if (carId !== undefined) {
      countQuery += ` AND d.car_id = $1`;
      countParams.push(carId);
    }
    
    const countResult = await client.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total)
    
    // 获取分页数据
    let dataQuery = `
      SELECT 
        d.id,
        d.start_date,
        d.end_date,
        d.start_address_id,
        d.end_address_id,
        d.start_geofence_id,
        d.end_geofence_id,
        d.start_km,
        d.end_km,
        d.distance,
        d.duration_min,
        d.outside_temp_avg,
        d.inside_temp_avg,
        d.speed_max,
        d.power_max,
        d.power_min,
        d.start_ideal_range_km,
        d.end_ideal_range_km,
        d.start_rated_range_km,
        d.end_rated_range_km,
        d.car_id,
        COALESCE(start_geofence.name, 
          CONCAT_WS(', ', 
            COALESCE(start_address.name, 
              NULLIF(CONCAT_WS(' ', start_address.road, start_address.house_number), '')
            ), 
            start_address.city
          )
        ) AS start_address,
        COALESCE(end_geofence.name, 
          CONCAT_WS(', ', 
            COALESCE(end_address.name, 
              NULLIF(CONCAT_WS(' ', end_address.road, end_address.house_number), '')
            ), 
            end_address.city
          )
        ) AS end_address,
        -- 获取起始坐标（行程第一个位置点）
        start_pos.latitude AS start_latitude,
        start_pos.longitude AS start_longitude,
        -- 获取结束坐标（行程最后一个位置点）
        end_pos.latitude AS end_latitude,
        end_pos.longitude AS end_longitude
      FROM drives d
      LEFT JOIN addresses start_address ON d.start_address_id = start_address.id
      LEFT JOIN addresses end_address ON d.end_address_id = end_address.id
      LEFT JOIN geofences start_geofence ON d.start_geofence_id = start_geofence.id
      LEFT JOIN geofences end_geofence ON d.end_geofence_id = end_geofence.id
      -- 获取起始位置坐标
      LEFT JOIN LATERAL (
        SELECT latitude, longitude 
        FROM positions 
        WHERE drive_id = d.id 
        ORDER BY date ASC 
        LIMIT 1
      ) start_pos ON true
      -- 获取结束位置坐标
      LEFT JOIN LATERAL (
        SELECT latitude, longitude 
        FROM positions 
        WHERE drive_id = d.id 
        ORDER BY date DESC 
        LIMIT 1
      ) end_pos ON true
      WHERE d.end_date IS NOT NULL
    `;
    
    const dataParams: any[] = [];
    
    // 如果指定了车辆ID，则添加过滤条件
    if (carId !== undefined) {
      dataQuery += ` AND d.car_id = $1`;
      dataParams.push(carId);
    }
    
    dataQuery += ` ORDER BY d.start_date DESC LIMIT $2 OFFSET $3`;
    dataParams.push(limit, offset);
    
    const result = await client.query(dataQuery, dataParams);
    
    const trips: Trip[] = result.rows
    
            // 批量获取详细地址
        if (trips.length > 0) {
          try {
            // 准备坐标数据（起始和结束坐标）
            const coordinates: Array<{ longitude: number | string; latitude: number | string }> = []
            const coordinateMap: Array<{ tripIndex: number; type: 'start' | 'end' }> = []
            
            trips.forEach((trip, index) => {
              // 添加起始坐标
              if (trip.start_longitude !== null && trip.start_latitude !== null) {
                // 直接使用原始WGS84坐标，getAddressesByCoordinatesBatch函数会处理坐标转换
                coordinates.push({
                  longitude: trip.start_longitude,
                  latitude: trip.start_latitude
                })
                coordinateMap.push({ tripIndex: index, type: 'start' })
              }
              
              // 添加结束坐标
              if (trip.end_longitude !== null && trip.end_latitude !== null) {
                // 直接使用原始WGS84坐标，getAddressesByCoordinatesBatch函数会处理坐标转换
                coordinates.push({
                  longitude: trip.end_longitude,
                  latitude: trip.end_latitude
                })
                coordinateMap.push({ tripIndex: index, type: 'end' })
              }
            })
        
        // 批量获取地址
        if (coordinates.length > 0) {
          const addresses = await getAddressesWithCache(coordinates)
          
          // 将地址分配回对应的行程
          addresses.forEach((address, index) => {
            const mapping = coordinateMap[index]
            if (mapping) {
              const trip = trips[mapping.tripIndex]
              if (mapping.type === 'start') {
                trip.start_detailed_address = address
              } else {
                trip.end_detailed_address = address
              }
            }
          })
        }
        
        // 生成行程标题
        trips.forEach(trip => {
          const startAddr = (trip.start_detailed_address !== null && trip.start_detailed_address !== undefined) 
            ? trip.start_detailed_address 
            : simplifyAddress(trip.start_address);
          const endAddr = (trip.end_detailed_address !== null && trip.end_detailed_address !== undefined) 
            ? trip.end_detailed_address 
            : simplifyAddress(trip.end_address);
          
          if (startAddr === '未知位置' && endAddr === '未知位置') {
            trip.trip_title = '未知行程'
          } else {
            trip.trip_title = `${startAddr} → ${endAddr}`
          }
        })
        
      } catch (error) {
        console.error('批量获取地址失败:', error)
        // 如果获取详细地址失败，使用数据库地址生成标题
        trips.forEach(trip => {
          const startAddr = simplifyAddress(trip.start_address)
          const endAddr = simplifyAddress(trip.end_address)
          trip.trip_title = `${startAddr} → ${endAddr}`
        })
      }
    }
    
    const hasMore = offset + limit < total
    
    return {
      trips,
      hasMore,
      total
    }
  } finally {
    client.release()
  }
}

// 根据ID获取行程详情
export async function getTripById(id: number): Promise<Trip | null> {
  // 构建时返回null
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return null;
  }
  
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT 
        d.id,
        d.start_date,
        d.end_date,
        d.start_address_id,
        d.end_address_id,
        d.start_geofence_id,
        d.end_geofence_id,
        d.start_km,
        d.end_km,
        d.distance,
        d.duration_min,
        d.outside_temp_avg,
        d.inside_temp_avg,
        d.speed_max,
        d.power_max,
        d.power_min,
        d.start_ideal_range_km,
        d.end_ideal_range_km,
        d.start_rated_range_km,
        d.end_rated_range_km,
        d.car_id,
        COALESCE(start_geofence.name, 
          CONCAT_WS(', ', 
            COALESCE(start_address.name, 
              NULLIF(CONCAT_WS(' ', start_address.road, start_address.house_number), '')
            ), 
            start_address.city
          )
        ) AS start_address,
        COALESCE(end_geofence.name, 
          CONCAT_WS(', ', 
            COALESCE(end_address.name, 
              NULLIF(CONCAT_WS(' ', end_address.road, end_address.house_number), '')
            ), 
            end_address.city
          )
        ) AS end_address,
        -- 获取起始坐标（行程第一个位置点）
        start_pos.latitude AS start_latitude,
        start_pos.longitude AS start_longitude,
        -- 获取结束坐标（行程最后一个位置点）
        end_pos.latitude AS end_latitude,
        end_pos.longitude AS end_longitude
      FROM drives d
      LEFT JOIN addresses start_address ON d.start_address_id = start_address.id
      LEFT JOIN addresses end_address ON d.end_address_id = end_address.id
      LEFT JOIN geofences start_geofence ON d.start_geofence_id = start_geofence.id
      LEFT JOIN geofences end_geofence ON d.end_geofence_id = end_geofence.id
      -- 获取起始位置坐标
      LEFT JOIN LATERAL (
        SELECT latitude, longitude 
        FROM positions 
        WHERE drive_id = d.id 
        ORDER BY date ASC 
        LIMIT 1
      ) start_pos ON true
      -- 获取结束位置坐标
      LEFT JOIN LATERAL (
        SELECT latitude, longitude 
        FROM positions 
        WHERE drive_id = d.id 
        ORDER BY date DESC 
        LIMIT 1
      ) end_pos ON true
      WHERE d.id = $1
    `, [id])
    return result.rows[0] || null
  } finally {
    client.release()
  }
}

// 获取行程的位置数据（用于绘制轨迹）
export async function getTripPositions(tripId: number): Promise<Position[]> {
  // 构建时返回空数组
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return [];
  }
  
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT 
        id, 
        date, 
        latitude, longitude, speed, power, 
        odometer, ideal_battery_range_km, battery_level,
        outside_temp, inside_temp, drive_id
      FROM positions 
      WHERE drive_id = $1 
      ORDER BY date ASC
    `, [tripId])
    
    // 直接返回原始数据，保持字符串格式以维持精度
    return result.rows
  } finally {
    client.release()
  }
}