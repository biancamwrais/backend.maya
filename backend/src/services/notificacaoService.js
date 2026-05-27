const db = require('../config/database');
const path = require('path');
const fs = require('fs');

// ============================================================================
// FIREBASE ADMIN SDK
// ============================================================================
// Inicializa o Firebase Admin uma unica vez. Procura o arquivo de credenciais
// em backend/firebase-key.json (que voce vai colocar manualmente).
//
// Se o arquivo nao existir, o backend continua funcionando mas SO salva
// notificacoes no banco (sem mandar push para o celular).
// ============================================================================

let admin = null;
let firebaseAtivo = false;

try {
  const chaveLocal = path.join(__dirname, '..', '..', 'firebase-key.json');
  if (fs.existsSync(chaveLocal)) {
    admin = require('firebase-admin');
    const serviceAccount = require(chaveLocal);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseAtivo = true;
    console.log('[Firebase] Admin SDK inicializado - push notifications ATIVAS');
  } else {
    console.log('[Firebase] firebase-key.json nao encontrado - push notifications DESATIVADAS');
    console.log('[Firebase] Notificacoes ainda funcionam in-app (sinininho do app)');
  }
} catch (err) {
  console.error('[Firebase] Erro ao inicializar:', err.message);
  console.log('[Firebase] Continuando sem push notifications');
}

// ============================================================================
// FUNCOES DO SERVICE
// ============================================================================

/**
 * Cria uma notificacao para o paciente.
 *
 * 1. Salva no banco (tabela notificacoes) -> aparece no sininho do app
 * 2. Envia push notification via Firebase (se o paciente tiver firebase_token
 *    cadastrado e o Firebase Admin estiver configurado)
 *
 * @param {number} pacienteId - ID do paciente
 * @param {string} tipo - 'LEMBRETE_EXERCICIO' | 'CONSULTA' | 'PROGRESSO' | 'SISTEMA'
 * @param {string} titulo - Titulo curto
 * @param {string} mensagem - Texto da notificacao
 */
async function criar(pacienteId, tipo, titulo, mensagem) {
  // 1. Busca o usuario_id do paciente
  const [pacientes] = await db.query(
    'SELECT usuario_id, firebase_token FROM pacientes WHERE id = ?',
    [pacienteId]
  );

  if (!pacientes.length) {
    console.warn(`[notificacaoService] Paciente ${pacienteId} nao encontrado`);
    return;
  }
  const { usuario_id: usuarioId, firebase_token: firebaseToken } = pacientes[0];

  // 2. Salva no banco (sempre)
  await db.query(
    `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, lida, criada_em)
     VALUES (?, ?, ?, ?, 0, NOW())`,
    [usuarioId, tipo, titulo, mensagem]
  );

  // 3. Tenta enviar push se tiver token Firebase E o admin SDK estiver ativo
  if (firebaseToken && firebaseAtivo) {
    try {
      await admin.messaging().send({
        token: firebaseToken,
        notification: { title: titulo, body: mensagem },
        data: {
          tipo: tipo || 'SISTEMA',
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'maya_rpg_default',
            sound: 'default'
          }
        }
      });
      console.log(`[FCM] Push enviado para paciente ${pacienteId}`);
    } catch (err) {
      // Token invalido ou expirado -> limpa do banco
      if (err.code === 'messaging/registration-token-not-registered' ||
          err.code === 'messaging/invalid-registration-token') {
        console.log(`[FCM] Token invalido do paciente ${pacienteId}, removendo`);
        await db.query(
          'UPDATE pacientes SET firebase_token = NULL WHERE id = ?',
          [pacienteId]
        );
      } else {
        console.error('[FCM] Erro ao enviar push:', err.message);
      }
    }
  }
}

module.exports = { criar };
