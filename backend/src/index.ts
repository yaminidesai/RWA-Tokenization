import { app } from './api/app'
import { config } from './config'
import { db } from './db/client'

async function main() {
  // Verify database connection
  try {
    await db.query('SELECT 1')
    console.log('[DB] Connected to PostgreSQL')
  } catch (err) {
    console.error('[DB] Failed to connect:', err)
    process.exit(1)
  }

  app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║   RWA Treasury Bond Tokenization Platform        ║
║   Backend API running on port ${config.port}             ║
╠══════════════════════════════════════════════════╣
║   POST /api/auth/register    — investor signup   ║
║   POST /api/auth/login       — login             ║
║   GET  /api/bonds            — available bonds   ║
║   GET  /api/investor/...     — investor actions  ║
║   GET  /api/admin/...        — bank admin panel  ║
╚══════════════════════════════════════════════════╝
    `)
  })
}

main()
