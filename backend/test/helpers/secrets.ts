import { randomBytes } from 'node:crypto'

export const SECRET_A = randomBytes(32).toString('base64')
export const SECRET_B = randomBytes(32).toString('base64')
export const DAILY_SEED = 'test-daily-seed-0123456789abcdef'
