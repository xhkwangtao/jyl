const AI_AVATAR_SRC = '/images/xiaojiu.png'
const SCORE_PER_SECRET = 100

const AI_OFFICER_LEVELS = [
  {
    id: 'recruit',
    shortTitle: '新兵',
    title: '见习守城兵',
    minPoints: 0,
    rewardText: '获得入营腰牌'
  },
  {
    id: 'scout',
    shortTitle: '斥候',
    title: '边关斥候',
    minPoints: 300,
    rewardText: '解锁巡山侦察身份'
  },
  {
    id: 'captain',
    shortTitle: '校尉',
    title: '烽火校尉',
    minPoints: 700,
    rewardText: '解锁烽火传令资格'
  },
  {
    id: 'guard',
    shortTitle: '守备',
    title: '关城守备',
    minPoints: 1100,
    rewardText: '解锁守城军令身份'
  },
  {
    id: 'general',
    shortTitle: '参将',
    title: '长城参将',
    minPoints: 1500,
    rewardText: '解锁边关统筹身份'
  },
  {
    id: 'marshal',
    shortTitle: '将军',
    title: '九眼楼将军',
    minPoints: 1900,
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
    return '收集第一枚暗号后，小九会从见习守城兵开始晋升。'
  }

  if (!nextLevel || collectedCount >= totalCount) {
    return '全部暗号已收齐，小九已经晋升为九眼楼将军，完成本次边关研学任务。'
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
