const db = require('../config/database');

/**
 * GET /paciente/notificacoes
 * Lista todas as notificacoes nao lidas do paciente logado, mais recentes primeiro.
 */
exports.listar = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;

    // Busca paciente_id do usuario logado
    const [pacientes] = await db.query(
      'SELECT id FROM pacientes WHERE usuario_id = ?',
      [usuarioId]
    );
    if (pacientes.length === 0) {
      return res.status(404).json({ erro: 'Paciente não encontrado' });
    }
    const pacienteId = pacientes[0].id;

    const [notificacoes] = await db.query(
      `SELECT id, tipo, titulo, mensagem, lida, criada_em
         FROM notificacoes
        WHERE paciente_id = ?
          AND lida = 0
        ORDER BY criada_em DESC
        LIMIT 50`,
      [pacienteId]
    );

    // Converte lida (TINYINT) para boolean para o app entender
    const resultado = notificacoes.map(n => ({
      ...n,
      lida: n.lida === 1
    }));

    res.json(resultado);
  } catch (err) {
    console.error('Erro ao listar notificações:', err);
    res.status(500).json({ erro: 'Erro ao listar notificações' });
  }
};

/**
 * PUT /paciente/notificacoes/:id/lida
 * Marca uma notificacao especifica como lida.
 */
exports.marcarLida = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const notificacaoId = req.params.id;

    const [pacientes] = await db.query(
      'SELECT id FROM pacientes WHERE usuario_id = ?',
      [usuarioId]
    );
    if (pacientes.length === 0) {
      return res.status(404).json({ erro: 'Paciente não encontrado' });
    }
    const pacienteId = pacientes[0].id;

    // So permite marcar lida se a notificacao for do proprio paciente
    const [resultado] = await db.query(
      `UPDATE notificacoes
          SET lida = 1
        WHERE id = ?
          AND paciente_id = ?`,
      [notificacaoId, pacienteId]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Notificação não encontrada' });
    }

    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao marcar lida:', err);
    res.status(500).json({ erro: 'Erro ao marcar lida' });
  }
};

/**
 * PUT /paciente/notificacoes/limpar
 * Marca TODAS as notificacoes do paciente como lidas (limpa a tela).
 */
exports.limparTudo = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;

    const [pacientes] = await db.query(
      'SELECT id FROM pacientes WHERE usuario_id = ?',
      [usuarioId]
    );
    if (pacientes.length === 0) {
      return res.status(404).json({ erro: 'Paciente não encontrado' });
    }
    const pacienteId = pacientes[0].id;

    const [resultado] = await db.query(
      `UPDATE notificacoes
          SET lida = 1
        WHERE paciente_id = ?
          AND lida = 0`,
      [pacienteId]
    );

    res.json({
      sucesso: true,
      total: resultado.affectedRows
    });
  } catch (err) {
    console.error('Erro ao limpar notificações:', err);
    res.status(500).json({ erro: 'Erro ao limpar notificações' });
  }
};
