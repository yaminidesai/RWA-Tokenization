import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { custodyService } from '../../services/custody.service'

const router = Router()
router.use(requireAuth)

// GET /api/bonds — list all available bonds for purchase
router.get('/', async (_req: Request, res: Response) => {
  try {
    const bonds = await custodyService.listAvailableBonds()
    res.json(bonds)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/bonds/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const bond = await custodyService.getBondById(req.params.id)
    if (!bond) {
      res.status(404).json({ error: 'Bond not found' })
      return
    }
    res.json(bond)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
