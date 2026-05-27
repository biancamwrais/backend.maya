const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'Email e senha obrigatorios' });

    const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ? AND ativo = TRUE', [email]);
    if (rows.length === 0) return res.status(401).json({ erro: 'Credenciais invalidas' });

    const usuario = rows[0];
    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk) return res.status(401).json({ erro: 'Credenciais invalidas' });

    // Se for paciente, busca o paciente_id
    let pacienteId = null;
    if (usuario.perfil === 'PACIENTE') {
      const [p] = await db.query('SELECT id FROM pacientes WHERE usuario_id = ?', [usuario.id]);
      if (p.length > 0) pacienteId = p[0].id;
    }

    // AJUSTE À PROVA DE BALAS: Se a Vercel falhar em ler a variável, usamos um texto de emergência.
    const segredo = process.env.JWT_SECRET || 'chave-de-emergencia-maya-rpg-2026';

    const token = jwt.sign(
      { id: usuario.id, perfil: usuario.perfil, pacienteId },
      segredo,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        pacienteId
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro interno' });
  }
};

// POST /api/auth/cadastro (paciente se cadastra pelo app)
exports.cadastro = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { nome, email, senha, cpf, telefone, dataNascimento, aceitouLgpd } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ erro: 'Nome, email e senha sao obrigatorios' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: 'Senha deve ter no minimo 6 caracteres' });
    }
    if (!aceitouLgpd) {
      return res.status(400).json({ erro: 'Necessario aceitar os termos LGPD' });
    }

    await conn.beginTransaction();

    const [exist] = await conn.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (exist.length > 0) {
      await conn.rollback();
      return res.status(409).json({ erro: 'Email ja cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const [resUser] = await conn.query(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil, aceitou_lgpd, data_lgpd) VALUES (?, ?, ?, "PACIENTE", TRUE, NOW())',
      [nome, email, senhaHash]
    );

    await conn.query(
      'INSERT INTO pacientes (usuario_id, cpf, telefone, data_nascimento) VALUES (?, ?, ?, ?)',
      [resUser.insertId, cpf || null, telefone || null, dataNascimento || null]
    );

    await conn.commit();
    res.status(201).json({ mensagem: 'Cadastro realizado com sucesso' });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ erro: 'Erro ao cadastrar' });
  } finally {
    conn.release();
  }
};