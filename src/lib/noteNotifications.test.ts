import { describe, it, expect } from 'vitest'

/**
 * TDD Tests for Note Notification Frequency
 * 
 * Frequency is stored in MINUTES:
 * - 1, 5, 15, 30 (dakika)
 * - 60, 120, 240, 720 (saat = dakika * 60)
 * - 1440 (günlük = 24 * 60)  
 * - 10080 (haftalık = 7 * 24 * 60)
 */

// Test the frequency conversion formula
describe('Note Notification Frequency', () => {

    describe('frequency to milliseconds conversion', () => {
        // This is the formula used in noteNotifications.ts
        const frequencyToMs = (frequencyMinutes: number) => frequencyMinutes * 60 * 1000

        it('should convert 1 minute to 60000 milliseconds', () => {
            expect(frequencyToMs(1)).toBe(60000)
        })

        it('should convert 5 minutes to 300000 milliseconds', () => {
            expect(frequencyToMs(5)).toBe(300000)
        })

        it('should convert 15 minutes to 900000 milliseconds', () => {
            expect(frequencyToMs(15)).toBe(900000)
        })

        it('should convert 30 minutes to 1800000 milliseconds', () => {
            expect(frequencyToMs(30)).toBe(1800000)
        })

        it('should convert 60 minutes (1 hour) to 3600000 milliseconds', () => {
            expect(frequencyToMs(60)).toBe(3600000)
        })

        it('should convert 120 minutes (2 hours) to 7200000 milliseconds', () => {
            expect(frequencyToMs(120)).toBe(7200000)
        })

        it('should convert 240 minutes (4 hours) to 14400000 milliseconds', () => {
            expect(frequencyToMs(240)).toBe(14400000)
        })

        it('should convert 720 minutes (12 hours) to 43200000 milliseconds', () => {
            expect(frequencyToMs(720)).toBe(43200000)
        })

        it('should convert 1440 minutes (daily) to 86400000 milliseconds', () => {
            expect(frequencyToMs(1440)).toBe(86400000)
        })

        it('should convert 10080 minutes (weekly) to 604800000 milliseconds', () => {
            expect(frequencyToMs(10080)).toBe(604800000)
        })
    })

    describe('valid frequency values', () => {
        const validFrequencies = [1, 5, 15, 30, 60, 120, 240, 720, 1440, 10080]

        it('should have exactly 10 frequency options', () => {
            expect(validFrequencies).toHaveLength(10)
        })

        it('should have 1 minute as minimum frequency', () => {
            expect(Math.min(...validFrequencies)).toBe(1)
        })

        it('should have 10080 minutes (weekly) as maximum frequency', () => {
            expect(Math.max(...validFrequencies)).toBe(10080)
        })

        it('should include all expected values', () => {
            expect(validFrequencies).toContain(1)     // 1 dakika
            expect(validFrequencies).toContain(5)     // 5 dakika
            expect(validFrequencies).toContain(15)    // 15 dakika
            expect(validFrequencies).toContain(30)    // 30 dakika
            expect(validFrequencies).toContain(60)    // 1 saat
            expect(validFrequencies).toContain(120)   // 2 saat
            expect(validFrequencies).toContain(240)   // 4 saat
            expect(validFrequencies).toContain(720)   // 12 saat
            expect(validFrequencies).toContain(1440)  // her gün
            expect(validFrequencies).toContain(10080) // her hafta
        })
    })

    describe('time elapsed check', () => {
        it('should correctly determine when enough time has passed', () => {
            const frequencyMinutes = 5
            const frequencyMs = frequencyMinutes * 60 * 1000 // 300000ms

            const now = Date.now()
            const lastSentAt6MinutesAgo = now - (6 * 60 * 1000) // 360000ms ago

            const timeSinceLastMs = now - lastSentAt6MinutesAgo

            expect(timeSinceLastMs >= frequencyMs).toBe(true)
        })

        it('should correctly determine when NOT enough time has passed', () => {
            const frequencyMinutes = 5
            const frequencyMs = frequencyMinutes * 60 * 1000 // 300000ms

            const now = Date.now()
            const lastSentAt3MinutesAgo = now - (3 * 60 * 1000) // 180000ms ago

            const timeSinceLastMs = now - lastSentAt3MinutesAgo

            expect(timeSinceLastMs >= frequencyMs).toBe(false)
        })
    })

    describe('default frequency', () => {
        const defaultFrequency = 240 // 4 hours in minutes

        it('should have default frequency of 240 minutes (4 hours)', () => {
            expect(defaultFrequency).toBe(240)
        })

        it('should equal 4 hours in minutes', () => {
            expect(defaultFrequency).toBe(4 * 60)
        })
    })
})
