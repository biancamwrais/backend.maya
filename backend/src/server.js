require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({ servico: 'Maya RPG API', versao: '1.0.0', status: 'online' });
});

app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Maya RPG rodando na porta ${PORT}`);
  console.log(`  - PC:       http://localhost:${PORT}`);
  console.log(`  - Celular:  http://192.168.0.159:${PORT}`);
});
module.exports = app;