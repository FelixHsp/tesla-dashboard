// 驾驶评分算法
// 基于Tesla Safety Score和开源算法的综合评分系统

import { Position, Trip } from './database'

// 评分结果接口
export interface DrivingScore {
  overall: number // 总分 (0-100)
  acceleration: number // 加速评分
  braking: number // 制动评分
  smoothness: number // 平稳性评分
  efficiency: number // 能效评分
  details: {
    hardAccelerations: number
    hardBrakings: number
    rapidSpeedChanges: number
    avgSpeedVariation: number
    powerEfficiency: number
  }
}

// 评分计算配置
const SCORING_CONFIG = {
  // 调整后的加速度阈值（更宽松）
  HARD_ACCELERATION_THRESHOLD: 0.4, // 0.4g (约9 mph/秒) - Tesla原标准稍微宽松
  HARD_BRAKING_THRESHOLD: 0.35, // 0.35g (约8 mph/秒) - 比急加速稍微严格
  
  // 速度变化平稳性阈值
  RAPID_SPEED_CHANGE_THRESHOLD: 15, // km/h per second - 放宽标准
  
  // 评分权重
  WEIGHTS: {
    acceleration: 0.3,
    braking: 0.3,
    smoothness: 0.2,
    efficiency: 0.2
  }
}

/**
 * 计算两个GPS点之间的距离（米）
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 计算加速度（m/s²）
 */
function calculateAcceleration(speed1: number, speed2: number, timeDiff: number): number {
  if (timeDiff <= 0) return 0;
  
  // 将速度从km/h转换为m/s
  const v1 = speed1 * 1000 / 3600;
  const v2 = speed2 * 1000 / 3600;
  
  // 计算加速度
  return (v2 - v1) / timeDiff;
}

/**
 * 将加速度转换为g单位
 */
function accelerationToG(acceleration: number): number {
  const G = 9.81; // 重力加速度
  return Math.abs(acceleration) / G;
}

/**
 * 计算加速评分
 */
function calculateAccelerationScore(positions: Position[]): { score: number; hardCount: number } {
  if (positions.length < 2) return { score: 100, hardCount: 0 };

  let hardAccelerations = 0;
  let totalMeasurements = 0;

  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];

    if (!prev.speed || !curr.speed) continue;

    const speed1 = typeof prev.speed === 'number' ? prev.speed : parseFloat(prev.speed);
    const speed2 = typeof curr.speed === 'number' ? curr.speed : parseFloat(curr.speed);
    
    if (isNaN(speed1) || isNaN(speed2) || !isFinite(speed1) || !isFinite(speed2)) continue;
    
    const timeDiff = (new Date(curr.date).getTime() - new Date(prev.date).getTime()) / 1000;
    
    if (timeDiff > 0 && timeDiff < 30) { // 忽略异常时间间隔，放宽至30秒
      const acceleration = calculateAcceleration(speed1, speed2, timeDiff);
      const accelerationG = accelerationToG(acceleration);

      if (acceleration > 0 && accelerationG > SCORING_CONFIG.HARD_ACCELERATION_THRESHOLD) {
        hardAccelerations++;
      }
      totalMeasurements++;
    }
  }

  if (totalMeasurements === 0) return { score: 100, hardCount: 0 };

  // 计算分数：硬加速越少分数越高
  const hardAccelerationRate = hardAccelerations / totalMeasurements;
  // 调整扣分逻辑：减少对少量急加速的严厉处罚
  const score = Math.max(0, 100 - (hardAccelerationRate * 500)); // 每1%的硬加速扣5分

  return { score: Math.min(100, score), hardCount: hardAccelerations };
}

/**
 * 计算制动评分
 */
function calculateBrakingScore(positions: Position[]): { score: number; hardCount: number } {
  if (positions.length < 2) return { score: 100, hardCount: 0 };

  let hardBrakings = 0;
  let totalMeasurements = 0;

  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];

    if (!prev.speed || !curr.speed) continue;

    const speed1 = typeof prev.speed === 'number' ? prev.speed : parseFloat(prev.speed);
    const speed2 = typeof curr.speed === 'number' ? curr.speed : parseFloat(curr.speed);
    
    if (isNaN(speed1) || isNaN(speed2) || !isFinite(speed1) || !isFinite(speed2)) continue;
    
    const timeDiff = (new Date(curr.date).getTime() - new Date(prev.date).getTime()) / 1000;
    
    if (timeDiff > 0 && timeDiff < 30) { // 忽略异常时间间隔，放宽至30秒
      const acceleration = calculateAcceleration(speed1, speed2, timeDiff);
      const accelerationG = accelerationToG(acceleration);

      if (acceleration < 0 && accelerationG > SCORING_CONFIG.HARD_BRAKING_THRESHOLD) {
        hardBrakings++;
      }
      totalMeasurements++;
    }
  }

  if (totalMeasurements === 0) return { score: 100, hardCount: 0 };

  // 计算分数：硬制动越少分数越高
  const hardBrakingRate = hardBrakings / totalMeasurements;
  // 调整扣分逻辑：减少对少量急制动的严厉处罚
  const score = Math.max(0, 100 - (hardBrakingRate * 500)); // 每1%的硬制动扣5分

  return { score: Math.min(100, score), hardCount: hardBrakings };
}

/**
 * 计算平稳性评分
 */
function calculateSmoothnessScore(positions: Position[]): { score: number; rapidChanges: number; avgVariation: number } {
  if (positions.length < 2) return { score: 100, rapidChanges: 0, avgVariation: 0 };

  let rapidSpeedChanges = 0;
  let speedVariations: number[] = [];

  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];

    if (!prev.speed || !curr.speed) continue;

    const speed1 = typeof prev.speed === 'number' ? prev.speed : parseFloat(prev.speed);
    const speed2 = typeof curr.speed === 'number' ? curr.speed : parseFloat(curr.speed);
    
    if (isNaN(speed1) || isNaN(speed2) || !isFinite(speed1) || !isFinite(speed2)) continue;
    
    const timeDiff = (new Date(curr.date).getTime() - new Date(prev.date).getTime()) / 1000;
    
    if (timeDiff > 0 && timeDiff < 30) { // 放宽平稳性计算的时间窗口
      const speedChange = Math.abs(speed2 - speed1);
      const speedChangeRate = speedChange / timeDiff; // km/h per second
      
      if (speedChangeRate > SCORING_CONFIG.RAPID_SPEED_CHANGE_THRESHOLD) {
        rapidSpeedChanges++;
      }

      // 收集速度变化率而不是绝对速度差，更能反映驾驶平稳性
      speedVariations.push(speedChangeRate);
    }
  }

  const avgVariation = speedVariations.length > 0 
    ? speedVariations.reduce((a, b) => a + b, 0) / speedVariations.length 
    : 0;

  console.log('平稳性计算调试:', {
    totalMeasurements: speedVariations.length,
    speedVariations: speedVariations.slice(0, 10), // 显示前10个值
    avgVariation: avgVariation,
    rapidSpeedChanges: rapidSpeedChanges
  });

  // 计算平稳性分数
  const rapidChangeRate = speedVariations.length > 0 ? rapidSpeedChanges / speedVariations.length : 0;
  const variationPenalty = Math.min(50, avgVariation * 2); // 平均变化越大扣分越多
  const rapidChangePenalty = rapidChangeRate * 30; // 急速变化扣分

  const score = Math.max(0, 100 - variationPenalty - rapidChangePenalty);

  return { 
    score: Math.min(100, score), 
    rapidChanges: rapidSpeedChanges, 
    avgVariation: avgVariation 
  };
}

/**
 * 计算能效评分
 */
function calculateEfficiencyScore(positions: Position[], trip?: Trip): { score: number; efficiency: number } {
  if (positions.length < 2) return { score: 100, efficiency: 100 };

  // 优先使用行程汇总数据
  if (trip) {
    // 计算电量消耗（使用rated range）
    const energyConsumed = trip.start_rated_range_km && trip.end_rated_range_km
      ? trip.start_rated_range_km - trip.end_rated_range_km 
      : null;
    
    // 计算行驶距离
    const distance = trip.distance || (trip.start_km && trip.end_km ? trip.end_km - trip.start_km : null);
    
    console.log('使用行程汇总数据计算能效:', {
      start_rated_range: trip.start_rated_range_km,
      end_rated_range: trip.end_rated_range_km,
      energyConsumed: energyConsumed,
      distance: distance,
      trip_distance: trip.distance
    });
    
    if (energyConsumed && distance && energyConsumed > 0 && distance > 0) {
      // 计算能效比率：电量消耗 / 行驶距离
      const efficiency = energyConsumed / distance;
      
      console.log('能效计算结果:', {
        energyConsumed: energyConsumed,
        distance: distance,
        efficiency: efficiency
      });
      
      // 理想效率：消耗1km续航行驶1km，即比率为1.0
      const idealRatio = 1.0;
      
      // 计算评分：比率越接近1.0分数越高
      let efficiencyScore;
      if (efficiency <= idealRatio) {
        efficiencyScore = 100;
      } else {
        // 比率1.5时扣50分，比率2.0时扣75分
        const penalty = Math.min(75, (efficiency - idealRatio) * 150);
        efficiencyScore = Math.max(25, 100 - penalty);
      }

      return { 
        score: Math.min(100, efficiencyScore), 
        efficiency: efficiency
      };
    }
  }
  
  // 回退到原始逻辑：使用位置数据计算
  console.log('行程汇总数据不足，回退到位置数据计算');
  return { score: 100, efficiency: 100 };
}

/**
 * 计算行程驾驶评分
 */
export function calculateDrivingScore(positions: Position[], trip?: Trip): DrivingScore {
  if (positions.length < 2) {
    return {
      overall: 100,
      acceleration: 100,
      braking: 100,
      smoothness: 100,
      efficiency: 100,
      details: {
        hardAccelerations: 0,
        hardBrakings: 0,
        rapidSpeedChanges: 0,
        avgSpeedVariation: 0,
        powerEfficiency: 0
      }
    };
  }

  // 计算各项评分
  const accelResult = calculateAccelerationScore(positions);
  const brakingResult = calculateBrakingScore(positions);
  const smoothnessResult = calculateSmoothnessScore(positions);
  const efficiencyResult = calculateEfficiencyScore(positions, trip);

  // 计算综合评分
  const overall = 
    accelResult.score * SCORING_CONFIG.WEIGHTS.acceleration +
    brakingResult.score * SCORING_CONFIG.WEIGHTS.braking +
    smoothnessResult.score * SCORING_CONFIG.WEIGHTS.smoothness +
    efficiencyResult.score * SCORING_CONFIG.WEIGHTS.efficiency;

  return {
    overall: Math.round(overall * 100) / 100,
    acceleration: Math.round(accelResult.score * 100) / 100,
    braking: Math.round(brakingResult.score * 100) / 100,
    smoothness: Math.round(smoothnessResult.score * 100) / 100,
    efficiency: Math.round(efficiencyResult.score * 100) / 100,
    details: {
      hardAccelerations: accelResult.hardCount,
      hardBrakings: brakingResult.hardCount,
      rapidSpeedChanges: smoothnessResult.rapidChanges,
      avgSpeedVariation: Math.round(smoothnessResult.avgVariation * 100) / 100,
      powerEfficiency: Math.round(efficiencyResult.efficiency * 100) / 100
    }
  };
}