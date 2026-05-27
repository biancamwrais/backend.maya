const bcrypt = require('bcryptjs');
const db = require('../config/database');
const notificacaoService = require('../services/notificacaoService');

// ============================================================================
// HELPERS
// ============================================================================

/** Normaliza texto removendo acentos e deixando lowercase, para comparacoes. */
function normalizar(txt) {
  if (!txt) return '';
  return String(txt)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Converte o nome de uma categoria (texto vindo do site) para o ID na tabela
 * categorias. Aceita variacoes com e sem acento.
 */
async function categoriaParaId(nomeCategoria) {
  if (!nomeCategoria) return null;
  const procurado = normalizar(nomeCategoria);
  const [linhas] = await db.query('SELECT id, nome FROM categorias');
  const achou = linhas.find((c) => normalizar(c.nome) === procurado);
  return achou ? achou.id : null;
}

/** Extrai o numero de uma string tipo "17 min", "20", "30 minutos". */
function extrairMinutos(str) {
  if (str == null) return null;
  const match = String(str).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function formatarData(data) {
  if (!data) return '—';
  const d = new Date(data);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

// ============================================================================
// PACIENTES
// ============================================================================

exports.listarPacientes = async (req, res) => {
  try {
    const { busca, status } = req.query;
    let sql = `SELECT p.id, u.nome, u.email, p.cpf, p.telefone, p.status
               FROM pacientes p JOIN usuarios u ON u.id = p.usuario_id WHERE 1=1`;
    const params = [];
    if (busca) {
      sql += ' AND (u.nome LIKE ? OR u.email LIKE ?)';
      params.push(`%${busca}%`, `%${busca}%`);
    }
    if (status) {
      sql += ' AND p.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY u.nome';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro' });
  }
};

exports.detalhePaciente = async (req, res) => {
  try {
    const [paciente] = await db.query(
      `SELECT p.*, u.nome, u.email FROM pacientes p
       JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = ?`,
      [req.params.id]
    );
    if (!paciente.length) return res.status(404).json({ erro: 'Nao encontrado' });

    const [prescricoes] = await db.query(
      `SELECT pr.*, e.titulo FROM prescricoes pr JOIN exercicios e ON e.id = pr.exercicio_id
       WHERE pr.paciente_id = ? ORDER BY pr.criada_em DESC`,
      [req.params.id]
    );

    const [execucoes] = await db.query(
      `SELECT ex.*, e.titulo FROM execucoes ex
       JOIN prescricoes pr ON pr.id = ex.prescricao_id
       JOIN exercicios e ON e.id = pr.exercicio_id
       WHERE ex.paciente_id = ? ORDER BY ex.data_execucao DESC LIMIT 30`,
      [req.params.id]
    );

    res.json({ paciente: paciente[0], prescricoes, execucoes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro' });
  }
};

// ============================================================================
// EXERCICIOS
// ============================================================================

/**
 * GET /api/admin/exercicios
 * Filtra por nome de categoria com normalizacao (ignora acentos e case).
 */
exports.listarExercicios = async (req, res) => {
  try {
    const { categoria, busca } = req.query;
    let sql = `SELECT e.id, e.titulo, e.descricao, e.instrucoes,
                      e.duracao_minutos, e.video_url, e.imagem_url,
                      e.categoria_id, e.tags, e.ativo,
                      c.nome AS categoria
                 FROM exercicios e
            LEFT JOIN categorias c ON c.id = e.categoria_id
                WHERE COALESCE(e.ativo, 1) = 1`;
    const params = [];

    if (categoria) {
      // Converte o nome da categoria para o ID e filtra por id (mais robusto
      // que comparar strings com/sem acento)
      const catId = await categoriaParaId(categoria);
      if (catId) {
        sql += ' AND e.categoria_id = ?';
        params.push(catId);
      } else {
        // Categoria desconhecida -> retorna lista vazia
        return res.json({ exercicios: [] });
      }
    }
    if (busca) {
      sql += ' AND e.titulo LIKE ?';
      params.push(`%${busca}%`);
    }
    sql += ' ORDER BY e.titulo';

    const [exercicios] = await db.query(sql, params);

    // Adapta para o formato que o site espera
    const adaptados = exercicios.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      descricao: e.descricao,
      instrucoes: e.instrucoes,
      categoria: e.categoria,
      duracao: e.duracao_minutos ? `${e.duracao_minutos} min` : null,
      video_url: e.video_url,
      imagem_url: e.imagem_url,
      beneficios: e.tags,
      series: null,
      repeticoes: null,
      dificuldade: 'facil'
    }));

    res.json({ exercicios: adaptados });
  } catch (err) {
    console.error('Erro ao listar exercicios:', err);
    res.status(500).json({ erro: 'Erro ao listar exercícios' });
  }
};

exports.criarExercicio = async (req, res) => {
  try {
    const {
      titulo, categoria, duracao, video_url,
      descricao, instrucoes, beneficios
    } = req.body;

    if (!titulo) {
      return res.status(400).json({ erro: 'Título é obrigatório' });
    }

    const categoriaId = await categoriaParaId(categoria);
    const duracaoMin = extrairMinutos(duracao);

    const [resultado] = await db.query(
      `INSERT INTO exercicios
         (titulo, categoria_id, duracao_minutos, video_url,
          descricao, instrucoes, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        titulo,
        categoriaId,
        duracaoMin,
        video_url || null,
        descricao || null,
        instrucoes || null,
        beneficios || null
      ]
    );

    res.status(201).json({ sucesso: true, id: resultado.insertId });
  } catch (err) {
    console.error('Erro ao criar exercicio:', err);
    res.status(500).json({ erro: 'Erro ao criar exercício' });
  }
};

exports.atualizarExercicio = async (req, res) => {
  try {
    const id = req.params.id;
    const {
      titulo, categoria, duracao, video_url,
      descricao, instrucoes, beneficios
    } = req.body;

    const categoriaId = await categoriaParaId(categoria);
    const duracaoMin = extrairMinutos(duracao);

    const [resultado] = await db.query(
      `UPDATE exercicios SET
         titulo = ?, categoria_id = ?, duracao_minutos = ?,
         video_url = ?, descricao = ?, instrucoes = ?, tags = ?
       WHERE id = ?`,
      [
        titulo,
        categoriaId,
        duracaoMin,
        video_url || null,
        descricao || null,
        instrucoes || null,
        beneficios || null,
        id
      ]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Exercício não encontrado' });
    }

    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao atualizar exercicio:', err);
    res.status(500).json({ erro: 'Erro ao atualizar exercício' });
  }
};

exports.excluirExercicio = async (req, res) => {
  try {
    await db.query('UPDATE exercicios SET ativo = FALSE WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro' });
  }
};

// ============================================================================
// PRESCRICOES
// ============================================================================

exports.criarPrescricao = async (req, res) => {
  try {
    const { pacienteId, exercicioId, frequencia, orientacoes, dataInicio, dataFim } = req.body;
    const [r] = await db.query(
      `INSERT INTO prescricoes (paciente_id, exercicio_id, profissional_id, frequencia, orientacoes, data_inicio, data_fim)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [pacienteId, exercicioId, req.usuario.id, frequencia, orientacoes, dataInicio, dataFim || null]
    );

    const [pac] = await db.query('SELECT usuario_id FROM pacientes WHERE id = ?', [pacienteId]);
    if (pac.length > 0) {
      const [ex] = await db.query('SELECT titulo FROM exercicios WHERE id = ?', [exercicioId]);
      await db.query(
        `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem)
         VALUES (?, 'LEMBRETE_EXERCICIO', 'Novo exercicio prescrito', ?)`,
        [pac[0].usuario_id, `A Dra. Maya prescreveu: ${ex[0]?.titulo || 'exercicio'} - ${frequencia || ''}`]
      );
    }
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro' });
  }
};

// ============================================================================
// AGENDAMENTOS
// ============================================================================

/**
 * Lista agendamentos.
 * O banco usa status em MAIUSCULO (AGENDADO, CONFIRMADO, PENDENTE, etc).
 * Aqui devolvemos minusculo para o site/app, mas o site faz a comparacao
 * em lowercase tambem entao tudo bate.
 */
exports.listarAgendamentos = async (req, res) => {
  try {
    const { mes, dataInicio, dataFim } = req.query;

    let where = '1=1';
    const params = [];

    if (mes) {
      where = "DATE_FORMAT(a.data, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')";
      params.push(mes);
    } else {
      if (dataInicio) { where += ' AND a.data >= ?'; params.push(dataInicio); }
      if (dataFim) { where += ' AND a.data <= ?'; params.push(dataFim); }
    }

    const [agendamentos] = await db.query(
      `SELECT a.id, a.paciente_id, a.servico_id, a.data, a.horario AS hora,
              a.status, a.origem, a.observacoes,
              u.nome AS paciente_nome,
              s.nome AS servico_nome
         FROM agendamentos a
         JOIN pacientes p ON p.id = a.paciente_id
         JOIN usuarios u ON u.id = p.usuario_id
         JOIN servicos s ON s.id = a.servico_id
        WHERE ${where}
        ORDER BY a.data DESC, a.horario DESC`,
      params
    );

    // Normaliza o status para minusculo (o site espera assim)
    const adaptados = agendamentos.map((a) => ({
      ...a,
      status: (a.status || '').toLowerCase()
    }));

    res.json({ agendamentos: adaptados });
  } catch (err) {
    console.error('Erro ao listar agendamentos:', err);
    res.status(500).json({ erro: 'Erro ao listar agendamentos' });
  }
};

/**
 * Atualiza status do agendamento (aceitar/recusar).
 * O site envia em minusculo ('confirmado', 'cancelado'), aqui convertemos
 * para o ENUM do banco em MAIUSCULO.
 */
exports.atualizarStatusAgendamento = async (req, res) => {
  try {
    const id = req.params.id;
    const statusOriginal = (req.body.status || '').toLowerCase();

    // Mapeia status minusculo do site/app -> ENUM do banco em maiusculo
    const mapaStatus = {
      'confirmado':  'CONFIRMADO',
      'cancelado':   'CANCELADO',
      'realizado':   'REALIZADO',
      'pendente':    'PENDENTE',
      'agendado':    'AGENDADO',
      'faltou':      'FALTOU'
    };

    const statusBanco = mapaStatus[statusOriginal];
    if (!statusBanco) {
      return res.status(400).json({ erro: 'Status inválido' });
    }

    const [agendamentos] = await db.query(
      `SELECT a.id, a.paciente_id, a.data, a.horario, a.origem, a.servico_id,
              u.nome AS paciente_nome,
              s.nome AS servico_nome
         FROM agendamentos a
         JOIN pacientes p ON p.id = a.paciente_id
         JOIN usuarios u ON u.id = p.usuario_id
         JOIN servicos s ON s.id = a.servico_id
        WHERE a.id = ?`,
      [id]
    );

    if (agendamentos.length === 0) {
      return res.status(404).json({ erro: 'Agendamento não encontrado' });
    }
    const ag = agendamentos[0];

    await db.query('UPDATE agendamentos SET status = ? WHERE id = ?', [statusBanco, id]);

    // Se for SOLICITACAO, notifica o paciente
    if (ag.origem === 'SOLICITACAO') {
      const dataFormatada = formatarData(ag.data);
      const horaFormatada = (ag.horario || '').toString().slice(0, 5);

      if (statusBanco === 'CONFIRMADO') {
        await notificacaoService.criar(
          ag.paciente_id,
          'CONSULTA',
          'Consulta confirmada!',
          `Sua consulta de ${ag.servico_nome || 'fisioterapia'} em ${dataFormatada} as ${horaFormatada} foi confirmada pela Dra. Maya.`
        );
      } else if (statusBanco === 'CANCELADO') {
        await notificacaoService.criar(
          ag.paciente_id,
          'CONSULTA',
          'Consulta nao disponivel',
          `A Dra. Maya nao pode confirmar sua solicitacao de consulta em ${dataFormatada} as ${horaFormatada}. Por favor, escolha outro horario.`
        );
      }
    }

    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    res.status(500).json({ erro: 'Erro ao atualizar status' });
  }
};

// ============================================================================
// PAGAMENTOS
// ============================================================================

exports.registrarPagamento = async (req, res) => {
  try {
    const { pacienteId, agendamentoId, descricao, valor, formaPagamento, dataPagamento } = req.body;
    const [r] = await db.query(
      `INSERT INTO pagamentos (paciente_id, agendamento_id, descricao, valor, forma_pagamento, data_pagamento)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [pacienteId, agendamentoId || null, descricao, valor, formaPagamento, dataPagamento]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro' });
  }
};

// ============================================================================
// DASHBOARD ADMIN
// ============================================================================

exports.dashboardAdmin = async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM pacientes WHERE status = 'ATIVO') AS pacientes_ativos,
        (SELECT COUNT(*) FROM agendamentos WHERE data = CURDATE()) AS consultas_hoje,
        (SELECT COUNT(*) FROM execucoes WHERE data_execucao >= NOW() - INTERVAL 7 DAY) AS execucoes_semana,
        (SELECT COUNT(DISTINCT paciente_id) FROM execucoes WHERE data_execucao >= NOW() - INTERVAL 7 DAY) AS pacientes_ativos_semana
    `);
    res.json(stats[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro' });
  }
};