// server.js
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
// O Render (e outros hosts) atribui uma porta via variável de ambiente PORT.
// Se não houver (para desenvolvimento local), usamos a 3000.
const port = process.env.PORT || 3000;

// --- Configuração do Pool de Conexões com o PostgreSQL (para Supabase) ---
// IMPORTANT: Use a variável de ambiente DATABASE_URL que será configurada no Render.
// Isso mantém suas credenciais seguras e flexíveis.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Conecta usando a URI completa do Supabase
    ssl: {
        // Necessário para conectar ao Supabase (ou qualquer DB externo com SSL)
        // rejectUnauthorized: false é frequentemente usado em desenvolvimento/testes,
        // mas em produção com requisitos de segurança rigorosos, pode ser necessário
        // um certificado de CA específico. Para este projeto, false é suficiente.
        rejectUnauthorized: false
    }
});

// --- Middlewares ---
// Middleware para processar JSON no corpo das requisições (POST/PUT)
app.use(express.json());
// Middleware para processar dados de formulário URL-encoded
app.use(express.urlencoded({ extended: true }));

// --- SERVIR ARQUIVOS ESTÁTICOS E A PÁGINA INICIAL ---
// Esta linha instrui o Express a servir arquivos estáticos (CSS, JS, imagens)
// da pasta 'public'. O path.join garante que o caminho funcione em qualquer SO.
app.use(express.static(path.join(__dirname, 'public')));

// Adiciona uma rota GET para a raiz do seu aplicativo ('/').
// Quando alguém acessa seu URL (ex: http://localhost:3000 ou seu-app.onrender.com),
// esta rota envia o arquivo index.html.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- ROTAS DA API ---

// Rota para adicionar um novo card ao banco de dados.
// Recebe 'front' e 'back' no corpo da requisição JSON.
app.post('/api/cards', async (req, res) => {
    const { front, back } = req.body;
    // Validação básica para garantir que os campos não estão vazios.
    if (!front || !back) {
        return res.status(400).json({ error: 'Frente e verso do card são obrigatórios.' });
    }

    try {
        // Insere o novo card na tabela 'cards' e retorna os dados do card inserido.
        const result = await pool.query(
            'INSERT INTO cards (front, back) VALUES ($1, $2) RETURNING *',
            [front, back]
        );
        res.status(201).json(result.rows[0]); // Retorna o card recém-criado com status 201 (Created).
    } catch (err) {
        console.error('Erro ao adicionar card:', err); // Loga o erro no console do servidor.
        res.status(500).json({ error: 'Erro interno do servidor ao adicionar card.' });
    }
});

// Rota para obter cards que estão prontos para revisão.
// Implementa a lógica básica de repetição espaçada.
app.get('/api/cards/review', async (req, res) => {
    try {
        // A consulta SQL seleciona cards onde a data da última revisão + o intervalo
        // de dias é menor ou igual à data atual. Isso significa que eles estão "vencidos"
        // para revisão. Limita a 10 cards e ordena pelos mais antigos primeiro.
        const result = await pool.query(
            `SELECT * FROM cards WHERE last_reviewed <= CURRENT_DATE - INTERVAL '1 day' * interval_days ORDER BY last_reviewed ASC LIMIT 10`
        );
        res.status(200).json(result.rows); // Retorna a lista de cards.
    } catch (err) {
        console.error('Erro ao buscar cards para revisão:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar cards.' });
    }
});

// Rota para atualizar um card após uma revisão, aplicando o algoritmo SM-2.
// Recebe a 'quality' (qualidade da revisão de 0 a 5) no corpo da requisição.
app.put('/api/cards/:id/review', async (req, res) => {
    const { id } = req.params; // ID do card vindo da URL.
    const { quality } = req.body; // Qualidade da revisão vindo do corpo da requisição.

    // Valida se a qualidade é um número entre 0 e 5.
    if (quality === undefined || quality < 0 || quality > 5) {
        return res.status(400).json({ error: 'Qualidade da revisão inválida (0-5).' });
    }

    try {
        // 1. Buscar o card atual para obter seus parâmetros de repetição espaçada.
        const cardResult = await pool.query('SELECT * FROM cards WHERE id = $1', [id]);
        if (cardResult.rows.length === 0) {
            return res.status(404).json({ error: 'Card não encontrado.' });
        }
        const card = cardResult.rows[0];

        // Inicializa as novas variáveis com os valores atuais do card.
        let newRepetitions = card.repetitions;
        let newEaseFactor = parseFloat(card.ease_factor); // Converte para número decimal.
        let newIntervalDays = card.interval_days;

        // --- Implementação do algoritmo SM-2 ---
        // (Simplificado para o core da funcionalidade)
        if (quality < 3) { // Se o usuário esqueceu ou teve muita dificuldade (0, 1, 2)
            newRepetitions = 0; // Reseta o contador de repetições bem-sucedidas.
            newIntervalDays = 1; // O card será revisado novamente amanhã.
        } else { // Se o usuário lembrou com alguma facilidade (3, 4, 5)
            // Ajusta o Fator de Facilidade (EF) com base na qualidade da revisão.
            // O EF determina o crescimento do intervalo.
            newEaseFactor = newEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            if (newEaseFactor < 1.3) newEaseFactor = 1.3; // Garante um fator mínimo para evitar intervalos negativos.

            // Calcula o novo intervalo de dias.
            if (newRepetitions === 0) { // Se esta é a primeira revisão bem-sucedida.
                newIntervalDays = 1;
            } else if (newRepetitions === 1) { // Se esta é a segunda revisão bem-sucedida.
                newIntervalDays = 6;
            } else { // Para todas as revisões subsequentes.
                newIntervalDays = Math.round(newIntervalDays * newEaseFactor);
            }
            newRepetitions++; // Incrementa o contador de repetições bem-sucedidas.
        }

        // 2. Atualizar o card no banco de dados com os novos parâmetros calculados.
        await pool.query(
            `UPDATE cards SET
                last_reviewed = CURRENT_DATE, -- Atualiza a data da última revisão para hoje.
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


// --- Iniciar o Servidor ---
// O aplicativo escuta na porta definida (process.env.PORT no Render, ou 3000 localmente).
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});