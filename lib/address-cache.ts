// 服务端专用的地址缓存模块
import { getCachedAddress, cacheAddress, createCoordinateAddressesTable, createTripScoresTable } from './database'
import { getAddressByCoordinate } from './amap'

// 坐标精度处理：保留3位小数（约100米精度）
function normalizeCoordinate(coord: number): number {
  return Math.round(coord * 1000) / 1000;
}

// 确保数据库表已初始化的Promise
let tableInitializationPromise: Promise<void> | null = null

// 确保数据库表存在（线程安全）
async function ensureTableExists(): Promise<void> {
  // 如果已经有初始化Promise在执行，直接等待它完成
  if (tableInitializationPromise) {
    return tableInitializationPromise;
  }

  // 创建初始化Promise并缓存
  tableInitializationPromise = (async () => {
    try {
      await createCoordinateAddressesTable();
      await createTripScoresTable();
      console.log('缓存表初始化完成');
    } catch (error) {
      console.error('初始化缓存表失败:', error);
      // 重置Promise以便下次重试
      tableInitializationPromise = null;
      // 不抛出错误，让后续查询仍能正常进行
    }
  })();

  return tableInitializationPromise;
}

// 带数据库缓存的地址查询（仅服务端使用）
export async function getAddressWithCache(longitude: number, latitude: number): Promise<string> {
  // 确保数据库表存在
  await ensureTableExists();

  // 调用内部函数处理实际的查询逻辑
  return await getAddressWithCacheInternal(longitude, latitude);
}

// 批量地址查询（带缓存）
export async function getAddressesWithCache(
  coordinates: Array<{ longitude: number | string; latitude: number | string }>
): Promise<string[]> {
  if (coordinates.length === 0) {
    return []
  }

  // 在批量查询开始时只初始化一次数据库表
  await ensureTableExists();

  // 使用Promise.all并行执行单个查询，利用缓存机制
  try {
    const promises = coordinates.map(async (coord) => {
      try {
        const lng = typeof coord.longitude === 'number' ? coord.longitude : parseFloat(coord.longitude);
        const lat = typeof coord.latitude === 'number' ? coord.latitude : parseFloat(coord.latitude);
        
        if (isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
          return '未知位置';
        }
        
        // 直接调用不带初始化的内部函数
        return await getAddressWithCacheInternal(lng, lat);
      } catch (error) {
        console.error('单个地址查询失败:', error);
        return '未知位置';
      }
    });

    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    console.error('批量地址查询失败:', error);
    return coordinates.map(() => '未知位置');
  }
}

// 内部地址查询函数（不处理表初始化）
async function getAddressWithCacheInternal(longitude: number, latitude: number): Promise<string> {
  // 标准化坐标精度以提高缓存命中率
  const normalizedLng = normalizeCoordinate(longitude);
  const normalizedLat = normalizeCoordinate(latitude);

  try {
    // 1. 检查数据库缓存（使用标准化坐标）
    const cachedAddress = await getCachedAddress(normalizedLng, normalizedLat);
    if (cachedAddress) {
      return cachedAddress;
    }
  } catch (error) {
    console.error('查询数据库缓存失败:', error);
    // 继续执行API查询
  }

  // 2. 调用高德API获取地址（使用原始坐标保持精度）
  const address = await getAddressByCoordinate(longitude, latitude);

  // 3. 异步缓存到数据库（使用标准化坐标，不等待完成，避免阻塞响应）
  if (address && address !== '未知位置') {
    cacheAddress(normalizedLng, normalizedLat, address).catch(error => {
      console.error('缓存地址到数据库失败:', error);
    });
  }

  return address;
}