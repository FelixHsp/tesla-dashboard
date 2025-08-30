// 服务端专用的工具函数
import { getAddressWithCache } from './address-cache'
import { simplifyAddress } from './utils'

// 使用坐标获取详细地址，失败时回退到数据库地址（服务端版本）
export async function getEnhancedAddress(
  databaseAddress: string | null,
  longitude: number | null,
  latitude: number | null
): Promise<string> {
  // 如果有坐标，尝试使用高德API获取详细地址
  if (longitude && latitude) {
    try {
      // 使用带缓存的地址查询函数
      const detailedAddress = await getAddressWithCache(longitude, latitude);
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

// 生成行程摘要标题 - 支持异步地址获取（服务端版本）
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