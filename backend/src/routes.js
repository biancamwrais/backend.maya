const express = require('express');
const router = express.Router();
const auth = require('./controllers/authController');
const pac = require('./controllers/pacienteController');
const adm = require('./controllers/adminController');
const { autenticar, permitirPerfis } = require('./middleware/auth');


router.post('/auth/login', auth.login);
router.post('/auth/cadastro', auth.cadastro);


router.post('/pacientes/me/solicitar-consulta', autenticar, pac.solicitarConsulta);
router.post('/pacientes/me/firebase-token', autenticar, pac.salvarFirebaseToken);
router.get('/pacientes/me/dashboard', autenticar, pac.dashboard);
router.get('/pacientes/me/exercicios', autenticar, pac.meusExercicios);
router.get('/pacientes/me/historico', autenticar, pac.historico);
router.get('/pacientes/me/notificacoes', autenticar, pac.notificacoes);
router.put('/notificacoes/:id/lida', autenticar, pac.marcarLida);
router.delete('/notificacoes', autenticar, pac.limparNotificacoes);
router.get('/pacientes/me/perfil', autenticar, pac.perfil);
router.get('/pacientes/me/pagamentos', autenticar, pac.pagamentos);

router.post('/execucoes', autenticar, pac.registrarExecucao);

router.get('/servicos', autenticar, pac.listarServicos);
router.get('/agendamentos/horarios', autenticar, pac.horariosDisponiveis);
router.post('/agendamentos', autenticar, pac.criarAgendamento);


const adminAuth = [autenticar, permitirPerfis('ADMIN','PROFISSIONAL')];

router.get('/admin/dashboard', adminAuth, adm.dashboardAdmin);
router.get('/admin/pacientes', adminAuth, adm.listarPacientes);
router.get('/admin/pacientes/:id', adminAuth, adm.detalhePaciente);

router.get('/admin/exercicios', adminAuth, adm.listarExercicios);
router.post('/admin/exercicios', adminAuth, adm.criarExercicio);
router.put('/admin/exercicios/:id', adminAuth, adm.atualizarExercicio);
router.delete('/admin/exercicios/:id', adminAuth, adm.excluirExercicio);

router.post('/admin/prescricoes', adminAuth, adm.criarPrescricao);

router.get('/admin/agendamentos', adminAuth, adm.listarAgendamentos);
router.put('/admin/agendamentos/:id/status', adminAuth, adm.atualizarStatusAgendamento);

router.post('/admin/pagamentos', adminAuth, adm.registrarPagamento);

module.exports = router;
