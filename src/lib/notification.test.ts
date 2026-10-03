import { describe, expect, it } from 'vitest'
import { getNativeScheduleTime } from './notification'

describe('native notification queue timing', () => {
    it('creates one distinct pending time for every configured item', () => {
        const now = new Date('2026-09-24T10:00:00.000Z')
        const times = Array.from({ length: 4 }, (_, index) =>
            getNativeScheduleTime(now, index, 15).toISOString()
        )

        expect(times).toEqual([
            '2026-09-24T10:15:00.000Z',
            '2026-09-24T10:30:00.000Z',
            '2026-09-24T10:45:00.000Z',
            '2026-09-24T11:00:00.000Z'
        ])
        expect(new Set(times)).toHaveLength(4)
    })
})
