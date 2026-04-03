import { Pool } from 'pg'
import { config } from '../config'

export const db = new Pool({ connectionString: config.db.url })

db.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err)
})
