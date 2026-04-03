import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.routes'
import investorRoutes from './routes/investor.routes'
import bondsRoutes from './routes/bonds.routes'
import adminRoutes from './routes/admin.routes'
import { errorHandler } from './middleware/error'

export const app = express()

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use('/api/auth',     authRoutes)
app.use('/api/investor', investorRoutes)
app.use('/api/bonds',    bondsRoutes)
app.use('/api/admin',    adminRoutes)

app.use(errorHandler)
