const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ erro: 'Token nao fornecido' });
  }

  const [, token] = authHeader.split(' ');
  try {
    const dados = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = dados;
    return next();
  } catch (e) {
    return res.status(401).json({ erro: 'Token invalido ou expirado' });
  }
}

function permitirPerfis(...perfis) {
  return (req, res, next) => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }
    next();
  };
}

module.exports = { autenticar, permitirPerfis };
