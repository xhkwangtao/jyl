const AI_AVATAR_SRC = '/images/xiaojiu.png'
const SCORE_PER_SECRET = 100

const AI_OFFICER_LEVELS = [
  {
    id: 'guard',
    shortTitle: '守兵',
    title: '守兵',
    minPoints: 0,
    rewardText: '获得守城身份'
  },
  {
    id: 'baihu',
    shortTitle: '百户',
    title: '百户',
    minPoints: 500,
    rewardText: '解锁百户官职'
  },
  {
    id: 'qianhu',
    shortTitle: '千户',
    title: '千户',
    minPoints: 1000,
    rewardText: '解锁千户官职'
  },
  {
    id: 'general',
    shortTitle: '参将',
    title: '参将',
    minPoints: 1500,
    rewardText: '达成最高官职'
  }
]

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function buildOfficerTrackList(currentPoints) {
  const currentLevelIndex = getCurrentOfficerLevelIndex(currentPoints)

  return AI_OFFICER_LEVELS.map((level, index) => ({
    id: level.id,
    shortTitle: level.shortTitle,
    title: level.title,
    thresholdText: `${level.minPoints} 军功`,
    rewardText: level.rewardText,
    reached: currentPoints >= level.minPoints,
    current: index === currentLevelIndex,
    locked: currentPoints < level.minPoints
  }))
}

function getCurrentOfficerLevelIndex(currentPoints) {
  let index = 0

  for (let levelIndex = 0; levelIndex < AI_OFFICER_LEVELS.length; levelIndex += 1) {
    if (currentPoints >= AI_OFFICER_LEVELS[levelIndex].minPoints) {
      index = levelIndex
    }
  }

  return index
}

function buildOfficerDescription(collectedCount, totalCount, currentLevel, nextLevel) {
  if (collectedCount <= 0) {
    return '收集第一枚暗号后，小九会从守兵开始晋升。'
  }

  if (!nextLevel || collectedCount >= totalCount) {
    return '全部暗号已收齐，小九已经晋升为参将，完成本次边关研学任务。'
  }

  return `每解锁 1 枚暗号可获得 ${SCORE_PER_SECRET} 军功，当前官职为 ${currentLevel.title}。`
}

function buildNextHint(currentPoints, collectedCount, totalCount, nextLevel) {
  if (!nextLevel || collectedCount >= totalCount) {
    return '当前已达成最高官职，无需继续晋升。'
  }

  const remainingPoints = Math.max(nextLevel.minPoints - currentPoints, 0)
  const remainingSecrets = Math.max(Math.ceil(remainingPoints / SCORE_PER_SECRET), 0)

  return `再收集 ${remainingSecrets} 枚暗号，可晋升为 ${nextLevel.title}。`
}

function buildProgressPercent(currentPoints, currentLevel, nextLevel) {
  if (!nextLevel) {
    return 100
  }

  const totalSpan = nextLevel.minPoints - currentLevel.minPoints

  if (totalSpan <= 0) {
    return 100
  }

  return clampPercent(((currentPoints - currentLevel.minPoints) / totalSpan) * 100)
}

function buildAiOfficerState(secretList = []) {
  const totalCount = secretList.length
  const collectedCount = secretList.filter((item) => item.collected).length
  const currentPoints = collectedCount * SCORE_PER_SECRET
  const currentLevelIndex = getCurrentOfficerLevelIndex(currentPoints)
  const currentLevel = AI_OFFICER_LEVELS[currentLevelIndex]
  const nextLevel = AI_OFFICER_LEVELS[currentLevelIndex + 1] || null
  const progressPercent = buildProgressPercent(currentPoints, currentLevel, nextLevel)

  return {
    aiAvatarSrc: AI_AVATAR_SRC,
    aiOfficerTitle: currentLevel.title,
    aiOfficerShortTitle: currentLevel.shortTitle,
    aiOfficerRewardText: currentLevel.rewardText,
    aiOfficerDesc: buildOfficerDescription(collectedCount, totalCount, currentLevel, nextLevel),
    aiOfficerNextHint: buildNextHint(currentPoints, collectedCount, totalCount, nextLevel),
    aiOfficerScore: currentPoints,
    aiOfficerScoreText: `${currentPoints} 军功`,
    aiOfficerProgressPercent: progressPercent,
    aiOfficerProgressPercentText: `${progressPercent}%`,
    aiOfficerNextTitle: nextLevel ? nextLevel.title : '最高官职已达成',
    aiOfficerRankList: buildOfficerTrackList(currentPoints),
    aiOfficerStageText: `已完成 ${currentLevelIndex + 1} / ${AI_OFFICER_LEVELS.length} 阶`,
    aiOfficerStageCount: currentLevelIndex + 1,
    aiOfficerTotalStageCount: AI_OFFICER_LEVELS.length,
    aiOfficerScoreRuleText: `每枚暗号 +${SCORE_PER_SECRET} 军功`
  }
}

module.exports = {
  AI_AVATAR_SRC,
  AI_OFFICER_LEVELS,
  SCORE_PER_SECRET,
  buildAiOfficerState
}
