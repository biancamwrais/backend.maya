const bcrypt = require('bcryptjs');

async function main() {
  const senhas = {
    'maya@clinica.com':    'maya123',
    'admin@clinica.com':   'admin123',
    'maria.santos@email.com': 'paciente123'
  };

  console.log('=== UPDATEs para rodar no MySQL Workbench ===\n');
  console.log('USE maya_rpg;\n');
  for (const [email, senha] of Object.entries(senhas)) {
    const hash = await bcrypt.hash(senha, 10);
    console.log(`UPDATE usuarios SET senha_hash = '${hash}' WHERE email = '${email}';`);
  }
  console.log('\n=== Senhas: ===');
  for (const [email, senha] of Object.entries(senhas)) {
    console.log(`${email} -> ${senha}`);
  }
}

main().catch(console.error);
