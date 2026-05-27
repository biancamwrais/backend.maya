require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

// CORS configurado para aceitar a Vercel e o Localhost
const corsOptions = {
  origin: ['https://sitemaya-admin.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));

// Essa é a rota que testamos no navegador
app.get('/', (req, res) => {
  res.json({ servico: 'Maya RPG API', versao: '1.0.0', status: 'online' });
});

app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

// A Vercel define variáveis de ambiente diferentes. 
// O app.listen só vai rodar quando você estiver testando no seu computador!
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Maya RPG rodando na porta ${PORT}`);
    console.log(`  - PC:       http://localhost:${PORT}`);
    console.log(`  - Celular:  http://192.168.0.159:${PORT}`);
  });
}

// Isso é o que a Vercel usa para iniciar a API
module.exports = app;