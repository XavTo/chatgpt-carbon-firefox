import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const { DATABASE_URL, PORT = 4000 } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL manquant. Ajoutez-le dans un fichier .env à la racine.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chatgpt_carbon_events (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      url TEXT,
      duration_sec REAL,
      prompt_chars INTEGER,
      reply_chars INTEGER,
      request_bytes BIGINT,
      response_bytes BIGINT,
      total_bytes BIGINT,
      compute_wh REAL,
      network_wh REAL,
      total_wh REAL,
      kg_co2 REAL,
      region TEXT,
      kg_per_kwh REAL
    )
  `);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/estimations', async (req, res) => {
  const {
    timestamp,
    url,
    durationSec,
    promptChars,
    replyChars,
    reqBytes,
    respBytes,
    totalBytes,
    computeWh,
    networkWh,
    totalWh,
    kgCO2,
    region,
    kgPerKWh
  } = req.body || {};

  if (typeof totalWh !== 'number' || typeof kgCO2 !== 'number') {
    return res.status(400).json({ ok: false, error: 'Payload invalide' });
  }

  try {
    await pool.query(
      `INSERT INTO chatgpt_carbon_events (
        created_at, url, duration_sec, prompt_chars, reply_chars,
        request_bytes, response_bytes, total_bytes, compute_wh, network_wh,
        total_wh, kg_co2, region, kg_per_kwh
      ) VALUES (
        COALESCE($1::timestamptz, NOW()), $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14
      )`,
      [
        timestamp || null,
        url || null,
        durationSec ?? null,
        promptChars ?? null,
        replyChars ?? null,
        reqBytes ?? null,
        respBytes ?? null,
        totalBytes ?? null,
        computeWh ?? null,
        networkWh ?? null,
        totalWh ?? null,
        kgCO2 ?? null,
        region || null,
        kgPerKWh ?? null
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur d\'insertion', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

app.get('/estimations', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM chatgpt_carbon_events ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('Erreur de lecture', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

ensureTable()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Serveur journalisation prêt sur http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Impossible d\'initialiser la base', err);
    process.exit(1);
  });
