const assert = require('node:assert/strict')

if (process.env.ANNOUNCEMENT_UTILS_TEST_FORCE_LOAD_FAILURE === '1') {
  throw new Error('forced announcement utils load failure')
}

const {
  buildAnnouncementFingerprint,
  buildImagePaddingTop,
  buildMiniProgramUrl,
  pickHomeModalAnnouncement,
  normalizeAnnouncementBlocks
} = require('../../miniprogram/utils/announcement-utils')

const tests = []

function test(name, run) {
  tests.push({ name, run })
}

test('buildAnnouncementFingerprint uses id and updated_at, with id-preserving static fallback', () => {
  assert.equal(
    buildAnnouncementFingerprint({
      id: 'announcement-1',
      updated_at: '2026-04-28T08:00:00Z'
    }),
    'announcement-1:2026-04-28T08:00:00Z'
  )

  assert.equal(
    buildAnnouncementFingerprint({
      id: 'announcement-1'
    }),
    'announcement-1:static'
  )

  assert.equal(
    buildAnnouncementFingerprint({
      updated_at: '2026-04-28T08:00:00Z'
    }),
    'static'
  )

  assert.equal(
    buildAnnouncementFingerprint({
      id: 0,
      updated_at: '2026-04-28T08:00:00Z'
    }),
    '0:2026-04-28T08:00:00Z'
  )

  assert.equal(
    buildAnnouncementFingerprint({
      id: '',
      updated_at: '2026-04-28T08:00:00Z'
    }),
    'static'
  )
})

test('pickHomeModalAnnouncement skips non-modal items and dismissed fingerprints', () => {
  const announcements = [
    {
      id: 'announcement-inline',
      updated_at: '2026-04-28T08:00:00Z',
      display_type: 'inline'
    },
    {
      id: 'announcement-dismissed',
      updated_at: '2026-04-28T09:00:00Z',
      display_type: 'modal'
    },
    {
      id: 'announcement-active',
      updated_at: '2026-04-28T10:00:00Z',
      display_type: 'modal'
    }
  ]

  assert.deepEqual(
    pickHomeModalAnnouncement(
      announcements,
      'announcement-dismissed:2026-04-28T09:00:00Z'
    ),
    announcements[2]
  )
})

test('pickHomeModalAnnouncement skips announcements outside active time window', () => {
  const now = new Date('2026-04-28T10:00:00Z')
  const announcements = [
    {
      id: 'announcement-future',
      updated_at: '2026-04-28T08:00:00Z',
      display_type: 'modal',
      starts_at: '2026-04-28T10:30:00Z',
      ends_at: '2026-04-28T12:00:00Z'
    },
    {
      id: 'announcement-expired',
      updated_at: '2026-04-28T08:30:00Z',
      display_type: 'modal',
      starts_at: '2026-04-28T07:00:00Z',
      ends_at: '2026-04-28T09:59:59Z'
    },
    {
      id: 'announcement-active',
      updated_at: '2026-04-28T09:00:00Z',
      display_type: 'modal',
      starts_at: '2026-04-28T09:00:00Z',
      ends_at: '2026-04-28T11:00:00Z'
    }
  ]

  assert.deepEqual(
    pickHomeModalAnnouncement(announcements, '', now),
    announcements[2]
  )
})

test('normalizeAnnouncementBlocks returns content_blocks unchanged when present', () => {
  const contentBlocks = [
    {
      id: 'block_1',
      type: 'paragraph',
      text: 'Pinned notice',
      link: {
        type: 'none',
        url: ''
      }
    }
  ]

  assert.equal(
    normalizeAnnouncementBlocks({
      content_blocks: contentBlocks,
      content: 'ignored fallback content'
    }),
    contentBlocks
  )
})

test('normalizeAnnouncementBlocks falls back to a renderer paragraph block from announcement content', () => {
  assert.deepEqual(
    normalizeAnnouncementBlocks({
      content: 'System maintenance tonight.',
      link_type: 'url',
      link_url: 'https://example.com/notice'
    }),
    [
      {
        id: 'fallback_content',
        type: 'paragraph',
        text: 'System maintenance tonight.',
        link: {
          type: 'url',
          url: 'https://example.com/notice'
        }
      }
    ]
  )
})

test('buildImagePaddingTop converts supported aspect ratios and falls back safely', () => {
  assert.equal(buildImagePaddingTop('16:9'), '56.25%')
  assert.equal(buildImagePaddingTop('4:3'), '75%')
  assert.equal(buildImagePaddingTop('invalid'), '56.25%')
})

test('buildMiniProgramUrl encodes query params for relative miniprogram pages', () => {
  assert.equal(
    buildMiniProgramUrl('/pages/index/index', {
      route_id: 3,
      keyword: 'wu yi'
    }),
    '/pages/index/index?route_id=3&keyword=wu%20yi'
  )
})

test('buildMiniProgramUrl rejects absolute urls', () => {
  assert.equal(
    buildMiniProgramUrl('https://example.com/pages/index/index', {
      route_id: 3
    }),
    ''
  )
})

module.exports = process.env.ANNOUNCEMENT_UTILS_TEST_FORCE_INVALID_EXPORT === '1'
  ? { invalid: true }
  : tests
