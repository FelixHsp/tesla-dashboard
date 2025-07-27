import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { getAddressByCoordinate } from './amap'
import { wgs84ToGcj02 } from './coordinate-transform'
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 时区配置
export const TIMEZONE = process.env.TZ || process.env.TIMEZONE || 'Asia/Shanghai'

// 处理时区显示的函数
export function formatDateWithTimezone(date: Date | string): Date {
  const dateObj = new Date(date)
  
  // 如果是UTC时间，需要转换为本地时间
  // TeslaMate通常存储UTC时间，需要根据配置的时区进行调整
  const offset = getTimezoneOffset(TIMEZONE)
  const localTime = new Date(dateObj.getTime() + offset * 60 * 60 * 1000)
  
  return localTime
}

// 获取时区偏移量（小时）
function getTimezoneOffset(timezone: string): number {
  const timezoneMap: { [key: string]: number } = {
    'Asia/Shanghai': 8,
    'Asia/Hong_Kong': 8,
    'Asia/Taipei': 8,
    'Asia/Tokyo': 9,
    'Asia/Seoul': 9,
    'Asia/Singapore': 8,
    'America/New_York': -5, // 标准时间，夏令时需要调整
    'America/Los_Angeles': -8,
    'Europe/London': 0,
    'Europe/Paris': 1,
    'Europe/Berlin': 1,
    'UTC': 0,
  }
  
  return timezoneMap[timezone] || 8 // 默认东八区
}

// 简化地址显示
export function simplifyAddress(address: string | null): string {
  if (!address) return '未知位置'
  
  // 移除常见的前缀和后缀
  let simplified = address
    .replace(/^(中国|北京市|上海市|广州市|深圳市|杭州市|南京市|武汉市|成都市|重庆市)/, '')
    .replace(/(市|区|县|镇|街道|路|街|巷|号)$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  
  // 如果还是太长，取前面的关键部分
  if (simplified.length > 12) {
    const parts = simplified.split(/[,，\s]+/)
    simplified = parts.slice(0, 2).join('')
  }
  
  return simplified || '未知位置'
}

// 使用坐标获取详细地址，失败时回退到数据库地址
export async function getEnhancedAddress(
  databaseAddress: string | null,
  longitude: number | null,
  latitude: number | null
): Promise<string> {
  // 如果有坐标，尝试使用高德API获取详细地址
  if (longitude && latitude) {
    try {
      // 直接传入原始坐标，getAddressByCoordinate函数会处理坐标转换
      const detailedAddress = await getAddressByCoordinate(longitude, latitude);
      if (detailedAddress && detailedAddress !== '未知位置') {
        return detailedAddress;
      }
    } catch (error) {
      console.warn('获取详细地址失败，使用数据库地址:', error);
    }
  }
  
  // 回退到数据库地址
  return simplifyAddress(databaseAddress);
}

// 生成行程摘要标题 - 支持异步地址获取
export async function generateTripTitle(
  startAddress: string | null,
  endAddress: string | null,
  startLongitude?: number | null | undefined,
  startLatitude?: number | null | undefined,
  endLongitude?: number | null | undefined,
  endLatitude?: number | null | undefined
): Promise<string> {
  try {
    // 转换可能为undefined的值为null
    const startLng = startLongitude ?? null
    const startLat = startLatitude ?? null
    const endLng = endLongitude ?? null
    const endLat = endLatitude ?? null
    
    // 并行获取起始和结束地址
    const [enhancedStartAddress, enhancedEndAddress] = await Promise.all([
      getEnhancedAddress(startAddress, startLng, startLat),
      getEnhancedAddress(endAddress, endLng, endLat)
    ])
    
    if (enhancedStartAddress === '未知位置' && enhancedEndAddress === '未知位置') {
      return '未知行程'
    }
    
    return `${enhancedStartAddress} → ${enhancedEndAddress}`
  } catch (error) {
    console.error('生成行程标题失败:', error)
    // 发生错误时回退到简单地址处理
    const start = simplifyAddress(startAddress)
    const end = simplifyAddress(endAddress)
    return `${start} → ${end}`
  }
}

// 同步版本的生成行程标题（用于不支持异步的场景）
export function generateTripTitleSync(startAddress: string | null, endAddress: string | null): string {
  const start = simplifyAddress(startAddress)
  const end = simplifyAddress(endAddress)
  
  if (start === '未知位置' && end === '未知位置') {
    return '未知行程'
  }
  
  return `${start} → ${end}`
}

// 计算行程距离（如果没有distance字段）
export function calculateDistance(startKm: number | null, endKm: number | null): number | null {
  if (startKm !== null && endKm !== null) {
    return endKm - startKm
  }
  return null
}

// 格式化时长
export function formatDuration(minutes: number | null): string {
  if (!minutes) return 'N/A'
  
  if (minutes < 60) {
    return `${Math.round(minutes)}分钟`
  }
  
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = Math.round(minutes % 60)
  
  if (remainingMinutes === 0) {
    return `${hours}小时`
  }
  
  return `${hours}小时${remainingMinutes}分钟`
} 