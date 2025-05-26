// server.js
const express = require('express');
const { Pool } = require('pg');
const path = require('path'); // Certifique-se que 'path' está importado

const app = express();
const port = 3000;

// --- Configuração do Pool de Conexões com o PostgreSQL (Supabase) ---
const pool = new Pool({
    user: 'postgres.glqjtspqsoavnbzsmbeh',
    host: 'aws-0-us-east-2.pooler.supabase.com',
    database: 'postgres',
    password: 'VgtT0aSLv1v4jHTp',
    port: 6543,
    ssl: {
        rejectUnauthorized: false
    }
});

// Middleware para processar JSON e URLs codificadas
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- SERVIR ARQUIVOS ESTÁTICOS E A PÁGINA INICIAL ---
// Esta linha serve qualquer arquivo estático dentro da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Adiciona uma rota para a raiz que explicitamente envia o index.html
// IMPORTANTE: Coloque esta rota ANTES de qualquer rota de API ou outras rotas que possam ter o mesmo prefixo.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- ROTAS DA API ---

// Rota para adicionar um novo card
app.post('/api/cards', async (req, res) => {
    const { front, back } = req.body;
    if (!front || !back) {
        return res.status(400).json({ error: 'Frente e verso do card são obrigatórios.' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO cards (front, back) VALUES ($1, $2) RETURNING *',
            [front, back]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao adicionar card:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao adicionar card.' });
    }
});

// Rota para obter cards para revisão
app.get('/api/cards/review', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM cards WHERE last_reviewed <= CURRENT_DATE - INTERVAL '1 day' * interval_days ORDER BY last_reviewed ASC LIMIT 10`
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar cards para revisão:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar cards.' });
    }
});

// Rota para atualizar um card após a revisão
app.put('/api/cards/:id/review', async (req, res) => {
    const { id } = req.params;
    const { quality } = req.body;

    if (quality === undefined || quality < 0 || quality > 5) {
        return res.status(400).json({ error: 'Qualidade da revisão inválida (0-5).' });
    }

    try {
        const cardResult = await pool.query('SELECT * FROM cards WHERE id = $1', [id]);
        if (cardResult.rows.length === 0) {
            return res.status(404).json({ error: 'Card não encontrado.' });
        }
        const card = cardResult.rows[0];

        let newRepetitions = card.repetitions;
        let newEaseFactor = parseFloat(card.ease_factor);
        let newIntervalDays = card.interval_days;

        if (quality < 3) {
            newRepetitions = 0;
            newIntervalDays = 1;
        } else {
            newEaseFactor = newEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            if (newEaseFactor < 1.3) newEaseFactor = 1.3;

            if (newRepetitions === 0) {
                newIntervalDays = 1;
            } else if (newRepetitions === 1) {
                newIntervalDays = 6;
            } else {
                newIntervalDays = Math.round(newIntervalDays * newEaseFactor);
            }
            newRepetitions++;
        }

        await pool.query(
            `UPDATE cards SET
                last_reviewed = CURRENT_DATE,
                repetitions = $1,
                ease_factor = $2,
                interval_days = $3
             WHERE id = $4`,
            [newRepetitions, newEaseFactor, newIntervalDays, id]
        );

        res.status(200).json({ message: 'Card atualizado com sucesso!', cardId: id });

    } catch (err) {
        console.error('Erro ao atualizar card após revisão:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao atualizar card.' });
    }
});

// Iniciar o servidor
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});