import express, { Request, Response } from 'express'
import cors from 'cors'

const app = express()
const PORT = Number(process.env.PORT || 5000)

app.use(cors())

app.get('/api/hello', (_req: Request, res: Response) => {
  res.send('Hello World!')
})

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`)
})
