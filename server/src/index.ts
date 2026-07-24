import express from 'express';
import cors from 'cors';
import recommendRouter from './routes/recommend';
import combosRouter from './routes/combos';

const app = express();

// If CLIENT_ORIGIN is set (e.g. your deployed frontend's URL), restrict CORS
// to that origin. Otherwise allow any origin, which is fine for local dev
// and for a hobby project with no auth or sensitive data behind the API.
const clientOrigin = process.env.CLIENT_ORIGIN;
app.use(cors(clientOrigin ? { origin: clientOrigin } : undefined));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', recommendRouter);
app.use('/api', combosRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
