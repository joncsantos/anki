// server.js
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
// O Render (e outros hosts) atribui uma porta via variável de ambiente PORT.
// Se não houver, usamos a 3000 para desenvolvimento local.
const port = process.env.PORT || 3000;

// --- Configuração do Pool de Conexões com o PostgreSQL (para Supabase) ---
// AGORA USANDO A VARIÁVEL DE AMBIENTE DATABASE_URL
// Essa variável DATABASE_URL será configurada no painel do Render.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Conecta usando a URI completa do Supabase
    ssl: {
        // Necessário para conectar ao Supabase (ou qualquer SSL externo)
        // Em produção, você pode querer investigar opções mais seguras para SSL se tiver certificados CA específicos.
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
        res.status(500).json({ error: 'Erro interno do servidor ao adicionar