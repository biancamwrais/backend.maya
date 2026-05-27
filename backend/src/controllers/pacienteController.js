const db = require('../config/database');
const notificacaoService = require('../services/notificacaoService');

// ============================================================================
// DASHBOARD
// ============================================================================

exports.dashboard = async (req, res) => {
  try {
    const pacienteId = req.usuario.pacienteId;
    const [rows] = await db.query(
      'SELECT * FROM vw_dashboard_paciente WHERE paciente_id = ?',
      [pacienteId]
    );
    const [proximas] = await db.query(
      `SELECT a.id, a.data, a.horario, s.nome AS servico, u.nome AS paciente
       FROM agendamentos a
       JOIN servicos s ON s.id = a.servico_id
       JOIN pacientes p ON p.id = a.paciente_id
       JOIN usuarios u ON u.id = p.usuario_id
       WHERE a.paciente_id = ? AND a.data >= CURDATE() AND a.status IN ('AGENDADO','CONFIRMADO')
       ORDER BY a.data, a.horario LIMIT 5`,
      [pacienteId]
    );
    res.json({ resumo: rows[0] || {}, proximasConsultas: proximas });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao carregar dashboard' });
  }
};

// ============================================================================
// EXERCICIOS
// ============================================================================

/**
 * IMPORTANTE: a tabela prescricoes usa o campo "ativa" (no feminino),
 * nao "ativo". Por isso a consulta abaixo filtra por p.ativa.
 */
exports.meusExercicios = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;

    const [pacientes] = await db.query(
      'SELECT id FROM pacientes WHERE usuario_id = ?',
      [usuarioId]
    );
    if (!pacientes.length) {
      return res.status(404).json({ erro: 'Paciente não encontrado' });
    }
    const pacienteId = pacientes[0].id;

    const [prescricoes] = await db.query(
      `SELECT p.id AS prescricao_id, p.exercicio_id, p.frequencia,
              p.orientacoes AS observacoes, p.ativa,
              e.titulo, c.nome AS categoria,
              e.duracao_minutos, e.descricao, e.instrucoes, e.tags AS beneficios,
              e.video_url, e.imagem_url
         FROM prescricoes p
         JOIN exercicios e ON e.id = p.exercicio_id
    LEFT JOIN categorias c ON c.id = e.categoria_id
        WHERE p.paciente_id = ? AND COALESCE(p.ativa, 1) = 1
        ORDER BY p.id DESC`,
      [pacienteId]
    );

    // Adapta nomes para o app entender (mantem o ativo em ingles pro front se preciso)
    const adaptados = prescricoes.map((p) => ({
      ...p,
      duracao: p.duracao_minutos ? `${p.duracao_minutos} min` : null
    }));

    const [statsAtivos] = await db.query(
      `SELECT COUNT(*) AS total
         FROM prescricoes
        WHERE paciente_id = ? AND COALESCE(ativa, 1) = 1`,
      [pacienteId]
    );

    const [statsSemana] = await db.query(
      `SELECT COUNT(*) AS total
         FROM execucoes
        WHERE paciente_id = ?
          AND data_execucao >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      [pacienteId]
    );

    res.json({
      prescricoes: adaptados,
      estatisticas: {
        ativos: statsAtivos[0].total,
        esta_semana: statsSemana[0].total
      }
    });
  } catch (err) {
    console.error('Erro ao buscar exercicios:', err);
    res.status(500).json({ erro: 'Erro ao buscar exercícios' });
  }
};

exports.registrarExecucao = async (req, res) => {
  try {
    const pacienteId = req.usuario.pacienteId;
    const { prescricaoId, nivelDor, observacoes } = req.body;

    if (prescricaoId == null || nivelDor == null) {
      return res.status(400).json({ erro: 'prescricaoId e nivelDor sao obrigatorios' });
    }
    if (nivelDor < 0 || nivelDor > 10) {
      return res.status(400).json({ erro: 'nivelDor deve estar entre 0 e 10' });
    }

    const [r] = await db.query(
      'INSERT INTO execucoes (prescricao_id, paciente_id, nivel_dor, observacoes) VALUES (?, ?, ?, ?)',
      [prescricaoId, pacienteId, nivelDor, observacoes || null]
    );
    res.status(201).json({ id: r.insertId, mensagem: 'Execucao registrada' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao registrar execucao' });
  }
};

// ============================================================================
// HISTORICO
// ============================================================================

exports.historico = async (req, res) => {
  try {
    const pacienteId = req.usuario.pacienteId;
    const [execucoes] = await db.query(
      `SELECT ex.id, ex.nivel_dor, ex.observacoes, ex.data_execucao,
              e.titulo, c.nome AS categoria
       FROM execucoes ex
       JOIN prescricoes pr ON pr.id = ex.prescricao_id
       JOIN exercicios e ON e.id = pr.exercicio_id
       LEFT JOIN categorias c ON c.id = e.categoria_id
       WHERE ex.paciente_id = ?
       ORDER BY ex.data_execucao DESC LIMIT 50`,
      [pacienteId]
    );

    const [grafico] = await db.query(
      `SELECT DATE(data_execucao) AS dia, ROUND(AVG(nivel_dor),1) AS dor_media
       FROM execucoes
       WHERE paciente_id = ? AND data_execucao >= NOW() - INTERVAL 7 DAY
       GROUP BY DATE(data_execucao) ORDER BY dia ASC`,
      [pacienteId]
    );

    const [resumo] = await db.query(
      `SELECT COUNT(*) AS total, ROUND(AVG(nivel_dor),1) AS dor_media
       FROM execucoes WHERE paciente_id = ? AND data_execucao >= NOW() - INTERVAL 7 DAY`,
      [pacienteId]
    );
    res.json({ resumo: resumo[0], grafico, execucoes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao carregar historico' });
  }
};

// ============================================================================
// NOTIFICACOES
// ============================================================================

exports.notificacoes = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const [rows] = await db.query(
      `SELECT id, tipo, titulo, mensagem, lida, criada_em
       FROM notificacoes WHERE usuario_id = ? ORDER BY criada_em DESC LIMIT 50`,
      [usuarioId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao carregar notificacoes' });
  }
};

exports.marcarLida = async (req, res) => {
  try {
    await db.query(
      'UPDATE notificacoes SET lida = TRUE WHERE id = ? AND usuario_id = ?',
      [req.params.id, req.usuario.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro' });
  }
};

exports.limparNotificacoes = async (req, res) => {
  try {
    await db.query(
      'UPDATE notificacoes SET lida = TRUE WHERE usuario_id = ?',
      [req.usuario.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro' });
  }
};

// ============================================================================
// SERVICOS E AGENDAMENTOS
// ============================================================================

exports.listarServicos = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM servicos WHERE ativo = TRUE');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: 'Erro' });
  }
};

exports.horariosDisponiveis = async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ erro: 'Parametro data obrigatorio' });

    const todos = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
                   '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00'];

    const [ocupados] = await db.query(
      `SELECT TIME_FORMAT(horario,'%H:%i') AS h FROM agendamentos
       WHERE data = ? AND status IN ('AGENDADO','CONFIRMADO','PENDENTE')`,
      [data]
    );
    const setOc = new Set(ocupados.map(o => o.h));
    res.json(todos.map(h => ({ horario: h, disponivel: !setOc.has(h) })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro' });
  }
};

/**
 * Cria agendamento DIRETO (status=AGENDADO).
 * Este endpoint e usado tanto pelo site (admin agendando) quanto pelo app
 * pelo botao antigo. O fluxo novo de SOLICITACAO usa solicitarConsulta.
 */
exports.criarAgendamento = async (req, res) => {
  try {
    const pacienteId = req.usuario.pacienteId;
    const { servicoId, data, horario } = req.body;
    if (!servicoId || !data || !horario) {
      return res.status(400).json({ erro: 'Campos obrigatorios faltando' });
    }
    const [r] = await db.query(
      `INSERT INTO agendamentos (paciente_id, servico_id, data, horario, status, origem)
       VALUES (?, ?, ?, ?, 'AGENDADO', 'DIRETO')`,
      [pacienteId, servicoId, data, horario]
    );

    await db.query(
      `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem)
       SELECT id, 'CONSULTA', 'Novo agendamento', CONCAT('Novo agendamento em ', ?, ' as ', ?)
       FROM usuarios WHERE perfil IN ('PROFISSIONAL','ADMIN')`,
      [data, horario]
    );

    res.status(201).json({ id: r.insertId, mensagem: 'Agendamento criado' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Horario ja ocupado' });
    }
    console.error(e);
    res.status(500).json({ erro: 'Erro ao agendar' });
  }
};

/**
 * Paciente solicita uma consulta. Fica com status=PENDENTE, origem=SOLICITACAO.
 * Sera chamado pelo botao "Solicitar Consulta" do Pacote 3B.
 */
exports.solicitarConsulta = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { servicoId, data, hora, observacoes } = req.body;

    if (!servicoId || !data || !hora) {
      return res.status(400).json({ erro: 'Informe servicoId, data e hora' });
    }

    const [pacientes] = await db.query(
      'SELECT id FROM pacientes WHERE usuario_id = ?',
      [usuarioId]
    );
    if (!pacientes.length) {
      return res.status(404).json({ erro: 'Paciente não encontrado' });
    }
    const pacienteId = pacientes[0].id;

    const [existentes] = await db.query(
      `SELECT id FROM agendamentos
        WHERE data = ? AND horario = ?
          AND status IN ('AGENDADO','CONFIRMADO','PENDENTE')`,
      [data, hora]
    );

    if (existentes.length > 0) {
      return res.status(409).json({
        erro: 'Esse horário já está ocupado ou tem solicitação pendente'
      });
    }

    const [resultado] = await db.query(
      `INSERT INTO agendamentos
         (paciente_id, servico_id, data, horario, status, origem, observacoes)
       VALUES (?, ?, ?, ?, 'PENDENTE', 'SOLICITACAO', ?)`,
      [pacienteId, servicoId, data, hora, observacoes || null]
    );

    res.status(201).json({
      sucesso: true,
      id: resultado.insertId,
      mensagem: 'Solicitação enviada! Você receberá uma notificação quando a Dra. Maya responder.'
    });
  } catch (err) {
    console.error('Erro ao solicitar consulta:', err);
    res.status(500).json({ erro: 'Erro ao solicitar consulta' });
  }
};

exports.salvarFirebaseToken = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ erro: 'Token é obrigatório' });
    }

    await db.query(
      'UPDATE pacientes SET firebase_token = ? WHERE usuario_id = ?',
      [token, usuarioId]
    );

    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao salvar firebase token:', err);
    res.status(500).json({ erro: 'Erro ao salvar token' });
  }
};

// ============================================================================
// PERFIL E PAGAMENTOS
// ============================================================================

exports.perfil = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.nome, u.email, p.cpf, p.telefone, p.data_nascimento,
              p.endereco, p.cidade, p.estado, p.cep
       FROM usuarios u JOIN pacientes p ON p.usuario_id = u.id
       WHERE p.id = ?`,
      [req.usuario.pacienteId]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Paciente nao encontrado' });

    const clinica = {
      nome: 'Maya Yamamoto - Fisioterapia RPG',
      endereco: 'Av. Paulista, 1000 - Conj. 501',
      cidade: 'Sao Paulo - SP',
      cep: '01310-100',
      telefone: '(11) 3456-7890',
      horario: 'Seg-Sex: 8h as 20h | Sab: 8h as 14h'
    };
    res.json({ paciente: rows[0], clinica });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro' });
  }
};

exports.pagamentos = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, descricao, valor, forma_pagamento, status, data_pagamento
       FROM pagamentos WHERE paciente_id = ?
       ORDER BY data_pagamento DESC`,
      [req.usuario.pacienteId]
    );
    const [tot] = await db.query(
      `SELECT COALESCE(SUM(valor),0) AS total FROM pagamentos WHERE paciente_id = ? AND status='PAGO'`,
      [req.usuario.pacienteId]
    );
    res.json({ total: tot[0].total, pagamentos: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro' });
  }
};